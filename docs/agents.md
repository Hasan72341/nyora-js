---
title: Agents
---

# Using Nyora from an AI agent / programmatically

Nyora is a good tool for AI agents and automation: a tiny, typed surface that
turns natural-language intents ("find X on source Y", "get chapter 1's pages")
into deterministic calls. This page is example-dense and copy-pasteable.

There are three ways to drive Nyora programmatically — pick one:

1. **In-process SDK** (`import { Nyora }`) — best for Node agents.
2. **`nyora-cli --json`** — best for shell/tool-calling agents.
3. **`NyoraServer` REST** — best for cross-process / cross-language agents.

## 1. Minimal SDK import surface

You almost never need more than this:

```ts
import { Nyora } from "nyora";
// optional, for typed handling:
import type { Source, Manga, MangaChapter, MangaPage } from "nyora";
import { ParserRuntimeError } from "nyora";
```

The whole agent loop is: **find a source → search → details → pages → (download)**.

## 2. End-to-end snippet (search → details → pages → download)

```ts
import { Nyora } from "nyora";
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import * as path from "node:path";

async function fetchFirstChapter(sourceQuery: string, title: string, outDir: string) {
  const client = new Nyora();
  try {
    // find a source by id or fuzzy name
    const source = client.sources.find(sourceQuery);

    // search it
    const results = await client.manga.search(source.id, title);
    if (!results.entries.length) return { ok: false, reason: "no search results" };
    const manga = results.entries[0];

    // details + chapters
    const { chapters } = await client.manga.details(source.id, manga.url, {
      title: manga.title,
    });
    if (!chapters.length) return { ok: false, reason: "no chapters" };

    // resolve page image URLs for the first chapter
    const pages = await client.manga.pages(source.id, chapters[0].url, {
      branch: chapters[0].branch,
    });

    // download the images (honoring per-page headers like Referer)
    await mkdir(outDir, { recursive: true });
    const saved: string[] = [];
    for (let i = 0; i < pages.length; i++) {
      const p = pages[i];
      const headers = { "User-Agent": "Mozilla/5.0", ...p.headers };
      const res = await fetch(p.url, { headers, redirect: "follow" });
      if (!res.ok || !res.body) continue;
      const ext = path.extname(new URL(p.url).pathname) || ".jpg";
      const file = path.join(outDir, `${String(i + 1).padStart(3, "0")}${ext}`);
      await pipeline(Readable.fromWeb(res.body as never), createWriteStream(file));
      saved.push(file);
    }
    return { ok: true, manga: manga.title, pages: pages.length, saved };
  } catch (err) {
    if (err instanceof ParserRuntimeError) return { ok: false, reason: err.message };
    throw err;
  } finally {
    client.close();
  }
}

// fetchFirstChapter("mangadex", "Frieren", "./out");
```

> The CLI's `download` subcommand does the same fetch loop but packs the pages
> into a single `.cbz` archive instead of loose files — prefer it for shell
> agents (next section).

## 3. Driving `nyora-cli --json` from a shell agent

Every subcommand supports `--json` (place it before the subcommand). Parse the
stdout; check the **exit code** (`0` ok, `1` handled error, `2` unknown command).

```bash
# list sources as JSON
nyora-cli --json sources --search asura

# search → first URL
URL=$(nyora-cli --json search -s mangadex "Frieren" | jq -r '.entries[0].url')

# details → first chapter URL
CH=$(nyora-cli --json details -s mangadex "$URL" | jq -r '.chapters[0].url')

# pages → list of image URLs
nyora-cli --json pages -s mangadex "$CH" | jq -r '.[].url'

# download as a .cbz (exit 0 if any page was packed); capture the file path
nyora-cli --json download -s mangadex -o ./out "$CH" | jq -r '.file'
```

JSON shapes returned by `--json`:

| Command | JSON |
|---|---|
| `sources` | `Source[]` |
| `search` / `popular` / `latest` | `{ entries: Manga[], hasNextPage: boolean }` |
| `details` | `{ manga: Manga, chapters: MangaChapter[] }` |
| `pages` | `MangaPage[]` (`{ url, headers }`) |
| `download` | `{ file: string, pages: number, total: number }` (`.cbz` path + counts) |
| `update` | `{ updated, version, bundlePath, sourcesPath }` |
| `version` | `{ package, ota }` |
| `serve` | `{ baseUrl }` |

## 4. Driving the `NyoraServer` REST API

For a long-running agent or a non-Node caller, run the server once and hit its
endpoints. It auto-writes a `helper.port` file for discovery.

```ts
import { NyoraServer, readBaseUrlFromPortFile } from "nyora";

// start once
const server = new NyoraServer({ port: 0 });
const baseUrl = await server.start();    // also discoverable via readBaseUrlFromPortFile()

const j = async (p: string) => (await fetch(`${baseUrl}${p}`)).json();

const { sources } = await j("/sources");
const id = sources[0].id;
const popular = await j(`/sources/popular?id=${id}&page=1`);
const details = await j(
  `/manga/details?id=${id}&url=${encodeURIComponent(popular.entries[0].url)}`,
);
const pages = await j(
  `/manga/pages?id=${id}&url=${encodeURIComponent(details.chapters[0].url)}`,
);

await server.stop();
```

See the **[Server guide](server.md)** for the full endpoint and error table.

## 5. Keep parsers current

Before a batch run, refresh the OTA bundle so the agent uses the latest parsers:

```ts
const client = new Nyora();
const { available } = await client.checkUpdate();
if (available) await client.update();    // sha256-verified, then reloads the runtime
```

```bash
nyora-cli update    # CLI equivalent
```

## Intent → SDK → CLI cheat-sheet

| Intent | SDK (in-process) | CLI (`--json`) | REST endpoint |
|---|---|---|---|
| List all sources | `client.sources.list()` | `nyora-cli sources` | `GET /sources` |
| Find a source by name/id | `client.sources.find("asura")` | `nyora-cli sources --search asura` | `GET /sources` (filter client-side) |
| Popular manga | `client.manga.popular(id, page)` | `nyora-cli popular -s id -p N` | `GET /sources/popular?id=&page=` |
| Latest manga | `client.manga.latest(id, page)` | `nyora-cli latest -s id -p N` | `GET /sources/latest?id=&page=` |
| Search a source | `client.manga.search(id, q, page)` | `nyora-cli search -s id -p N "q"` | `GET /sources/search?id=&q=&page=` |
| Manga details + chapters | `client.manga.details(id, url, { title })` | `nyora-cli details -s id "url"` | `GET /manga/details?id=&url=&title=` |
| Chapter page image URLs | `client.manga.pages(id, url, { branch })` | `nyora-cli pages -s id "url"` | `GET /manga/pages?id=&url=&branch=` |
| Download a chapter (`.cbz`) | (loop `fetch` over `pages`) | `nyora-cli download -s id -o OUT "url"` | (loop over `/manga/pages`) |
| Check for updates | `client.checkUpdate()` | — | — |
| Apply OTA update | `client.update({ force })` | `nyora-cli update [--force]` | — |
| Run a helper | `new NyoraServer().start()` | `nyora-cli serve` | — |
| Health check | — | — | `GET /health` |

## Agent guidance / gotchas

- **Always `client.close()`** (or `server.stop()`) when finished — the engine owns
  a jsdom window. Use `try/finally`.
- **Use `source.id`**, not the display name, for `manga.*` calls and REST `id=`.
- **Empty results ≠ errors.** The runtime is tolerant: a blocked or unreachable
  source usually returns an *empty* `entries`/`pages` array rather than throwing.
  Check `entries.length` / `pages.length`, and treat {@link ParserRuntimeError} as
  the hard-failure case.
- **Pass page `headers` when downloading.** Some sources require `Referer`; each
  {@link MangaPage} carries the headers it needs in `page.headers`.
- **Prefer one client per task.** A single client serializes onto one engine; for
  parallel fan-out, create multiple clients or run multiple servers.
- **Refresh parsers** with `update()` before long batch runs so fixes apply.
