---
title: Library
---

# Library (`npm install nyora`)

The importable **Nyora SDK** drives Nyora's source/parser engine from your own
Node.js code. It is fully self-contained: it runs the JavaScript parser bundle
in-process inside a jsdom window, using Node's native `fetch` for HTTP — no JVM
helper, no desktop app, no Java.

This guide documents the SDK surface. For the separate command-line tool, see the
**[CLI guide](cli.md)**.

## Import surface

Everything you typically need is a named export from `nyora`:

```ts
import {
  Nyora,            // default client (also the default export)
  SourcesService,   // client.sources
  MangaService,     // client.manga
  OtaManager,       // over-the-air updates
  NyoraServer,      // helper-compatible REST server
  NyoraError,       // base error
  ParserRuntimeError,
} from "nyora";

// Types are exported too:
import type {
  Source, Manga, MangaChapter, MangaPage, SearchPage, MangaDetails,
  OtaManifest, OtaUpdateResult, OtaUpdateAvailability,
} from "nyora";
```

`Nyora` is also the **default export**:

```ts
import Nyora from "nyora";
```

## The `Nyora` client

Create a client, use it, then `close()` it to release the embedded jsdom runtime.

```ts
import { Nyora } from "nyora";

const client = new Nyora();
try {
  // ... use client.sources and client.manga ...
} finally {
  client.close();
}
```

A `Nyora` instance owns:

- {@link Nyora.sources} — a {@link SourcesService}.
- {@link Nyora.manga} — a {@link MangaService}.
- {@link Nyora.ota} — the attached {@link OtaManager}.

Constructor options (all optional, mainly for testing/sharing):

```ts
new Nyora({ ota?: OtaManager, runtime?: RuntimeLike });
```

## `client.sources` — {@link SourcesService}

### `list(): Source[]`

Return every source in the bundled catalog.

```ts
const sources = client.sources.list();
console.log(sources.length, "sources");
console.log(sources[0]); // { id, name, lang, baseUrl, engine, isNsfw, ... }
```

### `find(query: string): Source`

Resolve a source by a **case-insensitive** id or name substring. Throws if
nothing matches.

```ts
const source = client.sources.find("asura");   // by fuzzy name
const md = client.sources.find("mangadex");     // by id
```

> Throws a plain `Error` (`No bundled source matched '<query>'`) when there is no
> match — wrap it in `try/catch` if the query is user-supplied.

A {@link Source} has the shape:

```ts
interface Source {
  id: string;            // stable identifier (use this for manga calls)
  name: string;          // human-readable name
  lang: string;          // locale code, e.g. "en"
  baseUrl: string;       // site base URL
  engine: string;        // "JavaScript"
  contentType: string;   // "Manga"
  isInstalled: boolean;
  isPinned: boolean;
  isNsfw: boolean;
  isObsolete: boolean;
  iconUrl: string;
  version: string;
  notes: string;
  canUninstall: boolean;
}
```

## `client.manga` — {@link MangaService}

All methods are `async` and take the **source id** (`source.id`) as the first
argument.

### `popular(sourceId, page = 1): Promise<SearchPage>`

```ts
const page = await client.manga.popular(source.id);          // page 1
const page2 = await client.manga.popular(source.id, 2);      // page 2
for (const m of page.entries) console.log(m.title, m.url);
console.log("more pages:", page.hasNextPage);
```

### `latest(sourceId, page = 1): Promise<SearchPage>`

Newest updated manga from the source.

```ts
const recent = await client.manga.latest(source.id);
```

### `search(sourceId, query, page = 1): Promise<SearchPage>`

```ts
const results = await client.manga.search(source.id, "Solo Leveling");
const hit = results.entries[0];
```

A {@link SearchPage} is:

```ts
interface SearchPage {
  entries: Manga[];
  hasNextPage: boolean;
}
```

### `details(sourceId, mangaUrl, options?): Promise<MangaDetails>`

Fetch full metadata plus the chapter list. Pass the known `title` to help the
parser resolve the entry.

```ts
const details = await client.manga.details(source.id, hit.url, { title: hit.title });
console.log(details.manga.description);
console.log(details.chapters.length, "chapters");
```

A {@link MangaDetails} is `{ manga: Manga, chapters: MangaChapter[] }`. The
{@link Manga} carries `title`, `altTitles`, `authors`, `description`, `tags`,
`coverUrl`, `state`, `isNsfw`, and more; each {@link MangaChapter} carries `id`,
`title`, `number`, `volume`, `url`, `scanlator`, `uploadDate`, and `branch`.

### `pages(sourceId, chapterUrl, options?): Promise<MangaPage[]>`

Resolve the ordered list of readable image pages for a chapter. Pass
`{ branch }` to select a scanlation branch/translation.

```ts
const pages = await client.manga.pages(source.id, details.chapters[0].url);
for (const p of pages) {
  console.log(p.url);       // image URL
  console.log(p.headers);   // request headers (e.g. { Referer: "..." })
}

// With a specific scanlation branch:
const branchPages = await client.manga.pages(source.id, chapter.url, {
  branch: chapter.branch,
});
```

A {@link MangaPage} is `{ url: string, headers: Record<string, string> }`. Some
sources require the `headers` (notably `Referer`) when you download the image.

## End-to-end

```ts
import { Nyora } from "nyora";

const client = new Nyora();
try {
  const source = client.sources.find("mangadex");
  const results = await client.manga.search(source.id, "Frieren");
  const first = results.entries[0];

  const { manga, chapters } = await client.manga.details(source.id, first.url, {
    title: first.title,
  });
  console.log(manga.title, "—", chapters.length, "chapters");

  const pages = await client.manga.pages(source.id, chapters[0].url);
  console.log(pages.map((p) => p.url));
} finally {
  client.close();
}
```

## Error handling

The SDK throws a small, typed hierarchy (all extend {@link NyoraError}):

| Error | Thrown when |
|---|---|
| {@link NyoraError} | Base class for SDK failures (e.g. OTA manifest fetch). |
| {@link ParserRuntimeError} | A parser is missing, a method is unknown, or the engine/parser fails. |
| {@link NyoraHTTPError} | A helper returned a non-2xx HTTP response (carries `statusCode`, `body`). |
| `Error` | `sources.find(...)` found no match. |

```ts
import { Nyora, ParserRuntimeError, NyoraError } from "nyora";

const client = new Nyora();
try {
  const page = await client.manga.popular("does-not-exist");
} catch (err) {
  if (err instanceof ParserRuntimeError) {
    console.error("parser failed:", err.message);
  } else if (err instanceof NyoraError) {
    console.error("nyora error:", err.message);
  } else {
    throw err;
  }
} finally {
  client.close();
}
```

> **Tolerance note (helper path).** The embedded runtime is deliberately
> tolerant: HTTP callbacks return the response body for **any** status code (and
> `""` on a transport failure) instead of throwing, and HTML parsing never throws
> on empty input. So a network hiccup or a `403` typically surfaces as an *empty*
> result (e.g. `page.entries.length === 0`) rather than an exception. Check for
> empty results, not just thrown errors.

## OTA updates

The client wraps the attached {@link OtaManager}:

```ts
// Apply an update and reload the runtime with the new parsers.
const result = await client.update();          // OtaUpdateResult
if (result.updated) console.log("now on OTA version", result.version);

// Force re-download:
await client.update({ force: true });

// Just check availability:
const { available, installed, latest } = await client.checkUpdate();
```

A pinned bundle ships inside the package, so the SDK works offline on first run
and only reaches the network when you call `update()` / `checkUpdate()` (or make
source requests). See the **[OTA guide](ota.md)** for details.

## Attaching to a running helper

If you'd rather not run the engine in-process, you can talk to a running Nyora
helper (the desktop app, another process, or `nyora-cli serve`) over its REST
contract. The config helpers locate one:

```ts
import { readBaseUrlFromPortFile, defaultPortFile } from "nyora";

const baseUrl = readBaseUrlFromPortFile();   // e.g. "http://127.0.0.1:54123" or null
console.log("helper port file:", defaultPortFile());
```

You can then `fetch` the [REST endpoints](server.md) directly, or run your own
{@link NyoraServer} to *be* the helper. See the **[Server guide](server.md)**.

## Lifecycle & concurrency

- Always call `client.close()` when done (use `try/finally`). It closes the jsdom
  window.
- A single client owns **one** jsdom runtime. For high-concurrency fan-out,
  create multiple `Nyora` instances (or run a {@link NyoraServer} which serializes
  calls onto one runtime). Within one client, interleaving many concurrent calls
  is supported but shares a single engine.
