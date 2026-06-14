---
title: Server
---

# Server (`NyoraServer` & `nyora-cli serve`)

{@link NyoraServer} turns the JS SDK into a **Nyora helper**: a small
`node:http` server that exposes the same camelCase REST contract as the JVM
helper and the Python `NyoraServer`, backed by an embedded
[`ParserRuntime`](library.md). Other Nyora apps and clients can attach to it
automatically via the `helper.port` discovery file.

## Start a server

### From the CLI

```bash
nyora-cli serve                       # loopback, free ephemeral port
nyora-cli serve --host 0.0.0.0 --port 8787
nyora-cli --json serve                # prints { "baseUrl": "http://127.0.0.1:54123" }
```

It prints the base URL, writes the `helper.port` file, and runs until `Ctrl+C`.

### From code

```ts
import { NyoraServer } from "nyora";

const server = new NyoraServer({ host: "127.0.0.1", port: 0 });
const baseUrl = await server.start();   // e.g. "http://127.0.0.1:54123"
console.log("listening at", baseUrl);

// ... serve requests ...

await server.stop();                    // closes the socket and owned runtime
```

Constructor options:

| Option | Default | Meaning |
|---|---|---|
| `host` | `"127.0.0.1"` | Interface to bind. |
| `port` | `0` | Port to bind; `0` picks a free ephemeral port. |
| `runtime` | new owned `ParserRuntime` | Share an existing runtime (not closed on `stop()`). |
| `writePortFile` | `true` | Write the bound port to the `helper.port` discovery file. |

## Endpoints

All responses are JSON. Query parameters are passed in the URL. Runtime calls are
**serialized** onto the single jsdom runtime, so concurrent requests are queued.

| Method | Path | Query params | Success body |
|---|---|---|---|
| GET | `/health` | — | `{ "ok": true, "engine": "node-jsdom" }` |
| GET | `/sources` | — | `{ "sources": [ /* helper-shape source objects */ ] }` |
| GET | `/sources/popular` | `id`, `page=1` | `{ "entries": [ /* manga */ ], "hasNextPage": bool }` |
| GET | `/sources/latest` | `id`, `page=1` | `{ "entries": [ /* manga */ ], "hasNextPage": bool }` |
| GET | `/sources/search` | `id`, `q`, `page=1` | `{ "entries": [ /* manga */ ], "hasNextPage": bool }` |
| GET | `/manga/details` | `id`, `url`, `title?` | `{ "manga": { ... }, "chapters": [ ... ] }` |
| GET | `/manga/pages` | `id`, `url`, `branch?` | `{ "pages": [ /* { url, headers } */ ] }` |

Notes:

- `id` is the **source id** (the `id` field from `/sources`).
- `url` is a manga URL for `/manga/details`, a chapter URL for `/manga/pages`.
- `hasNextPage` is `true` when the page returned any entries.

### Source shape (`/sources`)

Each entry in `sources` is the helper-compatible source record:

```json
{
  "id": "MANGADEX",
  "name": "MangaDex",
  "lang": "en",
  "baseUrl": "https://mangadex.org",
  "engine": "JavaScript",
  "contentType": "Manga",
  "isInstalled": true,
  "isPinned": false,
  "isNsfw": false,
  "canUninstall": false
}
```

### Error responses

Errors are returned as clean JSON (never a 500 stack trace):

| Status | When | Body |
|---|---|---|
| `400` | Missing/invalid query parameter (e.g. no `id`, bad `page`). | `{ "error": "Missing required query parameter: 'id'" }` |
| `404` | Unknown path. | `{ "error": "Not found: /nope" }` |
| `502` | An SDK/parser failure ({@link NyoraError}). | `{ "error": "<message>" }` |
| `500` | Any other unexpected error. | `{ "error": "<Name>: <message>" }` |

## `helper.port` discovery

On start (unless `writePortFile: false`), the server writes the bound port to a
platform-conventional file so other Nyora processes can discover it:

| Platform | `helper.port` location |
|---|---|
| macOS | `~/Library/Application Support/Nyora/helper.port` |
| Windows | `%APPDATA%\Nyora\helper.port` |
| Linux / other | `$XDG_CONFIG_HOME/nyora/helper.port` (XDG config dir) |

Override the path with the `NYORA_HELPER_PORT_FILE` environment variable.

Resolve and read it from code:

```ts
import { defaultPortFile, readBaseUrlFromPortFile } from "nyora";

console.log(defaultPortFile());                 // the platform path
const baseUrl = readBaseUrlFromPortFile();      // "http://127.0.0.1:<port>" or null
```

## Worked attach example

**Terminal 1 — run the server:**

```bash
nyora-cli serve
# -> Nyora server listening at http://127.0.0.1:54123
```

**Terminal 2 — discover and call it (no hardcoded port):**

```ts
import { readBaseUrlFromPortFile } from "nyora";

const baseUrl = readBaseUrlFromPortFile();
if (!baseUrl) throw new Error("no running Nyora helper found");

// Health check.
const health = await (await fetch(`${baseUrl}/health`)).json();
console.log(health); // { ok: true, engine: "node-jsdom" }

// List sources.
const { sources } = await (await fetch(`${baseUrl}/sources`)).json();
const md = sources.find((s) => s.id.toLowerCase().includes("mangadex"));

// Search → details → pages.
const search = await (
  await fetch(`${baseUrl}/sources/search?id=${md.id}&q=${encodeURIComponent("Frieren")}`)
).json();
const mangaUrl = search.entries[0].url;

const details = await (
  await fetch(`${baseUrl}/manga/details?id=${md.id}&url=${encodeURIComponent(mangaUrl)}`)
).json();
const chapterUrl = details.chapters[0].url;

const pages = await (
  await fetch(`${baseUrl}/manga/pages?id=${md.id}&url=${encodeURIComponent(chapterUrl)}`)
).json();
console.log(pages.pages.map((p) => p.url));
```

Or with `curl`:

```bash
PORT=$(cat "$HOME/Library/Application Support/Nyora/helper.port")   # macOS
curl "http://127.0.0.1:$PORT/health"
curl "http://127.0.0.1:$PORT/sources" | jq '.sources | length'
curl "http://127.0.0.1:$PORT/sources/popular?id=MANGADEX&page=1" | jq '.entries[0]'
```

## Concurrency & lifecycle

- `start()` is idempotent: calling it while running resolves to the existing URL.
- Requests are queued onto **one** jsdom runtime, so a slow source request delays
  others; run multiple servers (on different ports) to parallelize.
- `stop()` closes the listening socket and, if the server owns its runtime,
  closes that too. Safe to call when not running.
