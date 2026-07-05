---
title: Agents
---

# Using Nyora from an AI agent / programmatically

Nyora is a good tool for AI agents and automation: a tiny, typed surface that
turns natural-language intents ("find X on source Y", "get chapter 1's pages")
into deterministic calls against the Nyora cloud helper. This page is
example-dense and copy-pasteable.

There are two ways to drive Nyora programmatically — pick one:

1. **SDK client** (`import { Nyora }`) — best for Node agents.
2. **`nyora-cli --json`** — best for shell/tool-calling agents.

Both talk to the same cloud helper (`https://api.hasanraza.tech`, overridable via
the `baseUrl` option or the `NYORA_BASE_URL` environment variable).

## 1. Minimal SDK import surface

You almost never need more than this:

```ts
import { Nyora } from "nyora-sdk";
// optional, for typed handling:
import type { Source, Manga, MangaChapter, MangaPage } from "nyora-sdk";
import { NyoraError } from "nyora-sdk";
```

The whole agent loop is: **find a source → search → details → pages → (download)**.

## 2. End-to-end snippet (search → details → pages → download)

```ts
import { Nyora, NyoraError } from "nyora-sdk";
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import * as path from "node:path";

async function fetchFirstChapter(sourceQuery: string, title: string, outDir: string) {
  const client = new Nyora();

  // find a source by id or fuzzy name
  const source = await client.sources.find(sourceQuery);

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
| `version` | `{ package }` |

## 4. Point at a self-hosted helper

The SDK and CLI both talk to `https://api.hasanraza.tech` by default. To use your
own helper, pass a `baseUrl` or set `NYORA_BASE_URL`:

```ts
const client = new Nyora({ baseUrl: "http://127.0.0.1:8080" });
```

```bash
NYORA_BASE_URL=http://127.0.0.1:8080 nyora-cli --json sources | jq 'length'
```

## Intent → SDK → CLI cheat-sheet

| Intent | SDK (cloud client) | CLI (`--json`) | Helper endpoint |
|---|---|---|---|
| List loaded sources | `await client.sources.list()` | `nyora-cli sources` | `GET /sources` |
| List full catalog | `await client.sources.catalog()` | — | `GET /sources/catalog` |
| Find a source by name/id | `await client.sources.find("asura")` | `nyora-cli sources --search asura` | `GET /sources/catalog` (filter client-side) |
| Popular manga | `await client.manga.popular(id, page)` | `nyora-cli popular -s id -p N` | `GET /sources/popular?id=&page=` |
| Latest manga | `await client.manga.latest(id, page)` | `nyora-cli latest -s id -p N` | `GET /sources/latest?id=&page=` |
| Search a source | `await client.manga.search(id, q, page)` | `nyora-cli search -s id -p N "q"` | `GET /sources/search?id=&q=&page=` |
| Manga details + chapters | `await client.manga.details(id, url, { title })` | `nyora-cli details -s id "url"` | `GET /manga/details?id=&url=&title=` |
| Chapter page image URLs | `await client.manga.pages(id, url, { branch })` | `nyora-cli pages -s id "url"` | `GET /manga/pages?id=&url=&branch=` |
| Download a chapter (`.cbz`) | (loop `fetch` over `pages`) | `nyora-cli download -s id -o OUT "url"` | (loop over `/manga/pages`) |

## Sync (optional)

To make an agent's library follow a signed-in user across devices, use
{@link NyoraSync}:

```ts
import { NyoraSync } from "nyora-sdk";

const sync = new NyoraSync();
await sync.signIn("you@example.com", "password");
await sync.upsert("nyora_favourite", [
  { manga_id: "…", added_at: new Date().toISOString() },
]);
const favs = await sync.select("nyora_favourite");
```

See the **[Sync guide](sync.md)** for the tables and full API.

## Agent guidance / gotchas

- **`client.close()` is a no-op.** The cloud client holds no resources; calling it
  is harmless and kept for API compatibility.
- **Use `source.id`**, not the display name, for `manga.*` calls and helper `id=`.
- **Everything is `async`**, including `sources.list()`, `sources.catalog()`, and
  `sources.find()` — always `await` them.
- **Empty results are common.** A blocked or unreachable source usually returns an
  *empty* `entries`/`pages` array; check `entries.length` / `pages.length`, and
  treat {@link NyoraError} (or a thrown `Error`) as the hard-failure case.
- **Pass page `headers` when downloading.** Some sources require `Referer`; each
  {@link MangaPage} carries the headers it needs in `page.headers`.
- **Sources auto-install.** When a `manga.*` call targets a source not yet loaded
  on the helper, the client requests it and retries once — no extra step needed.
