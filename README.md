<div align="center">

<img src="https://nyora.pages.dev/icon.png" width="120" alt="Nyora" />

# Nyora — the manga reader SDK for JavaScript & TypeScript

### Build your own manga, manhwa & manhua reader in ~10 lines.

**`nyora-sdk`** is the official Node.js / TypeScript SDK for [Nyora](https://nyora.pages.dev) —
a thin cloud client that gives you **363 live, health-checked sources across 40 languages**
through one typed API: search, browse, read chapters, download pages, and sync a library
across devices. No scraper to maintain, no JVM, no jsdom, no parser bundle — `npm install
nyora-sdk` and you're reading in 60 seconds.

<p>
  <img alt="Node.js" src="https://img.shields.io/badge/Node.js-%3E%3D18-339933?style=for-the-badge&logo=node.js&logoColor=white" />
  <a href="https://www.npmjs.com/package/nyora-sdk"><img alt="npm version" src="https://img.shields.io/npm/v/nyora-sdk?style=for-the-badge&logo=npm&logoColor=white" /></a>
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" />
  <a href="https://www.apache.org/licenses/LICENSE-2.0"><img alt="License: Apache 2.0" src="https://img.shields.io/badge/License-Apache_2.0-blue.svg?style=for-the-badge" /></a>
</p>

</div>

> **In one line:** Nyora is the programmatic, cross-platform **Tachiyomi / Mihon /
> Kotatsu alternative** — a manga API and reader SDK you can `import`. If you're
> building a manga reader, a Discord/Telegram bot, a downloader, or a library manager
> in JavaScript or TypeScript, this is the fastest way to get **hundreds of working
> sources** without writing or maintaining a single scraper.

---

## Table of contents

- [Why Nyora](#why-nyora)
- [Install](#install)
- [Quickstart — a working reader in 10 lines](#quickstart)
- [Core concepts](#core-concepts)
- [API reference](#api-reference)
- [Recipes](#recipes)
- [Chapter ordering (ascending vs descending sources)](#chapter-ordering)
- [Cloud sync — a library across devices](#cloud-sync)
- [Command line (`nyora-cli`)](#command-line)
- [Interactive terminal reader (TUI)](#terminal-reader)
- [How it works](#how-it-works)
- [FAQ](#faq)
- [Ecosystem](#ecosystem)

---

## Why Nyora

| | |
|---|---|
| 📚 **363 working sources** | Every source is live health-checked; 597 dead or Cloudflare-walled ones are auto-hidden, so `list()`/`catalog()` return only sources that actually work — **363 across 40 languages** (268 all-ages, 95 mature). |
| 🌐 **One typed API** | `Source`, `Manga`, `MangaChapter`, `MangaPage`, `MangaDetails` — full TypeScript types, ESM, ships `.d.ts`. |
| ☁️ **Cloud-powered** | The [kotatsu-parsers](https://github.com/KotatsuApp/kotatsu-parsers) engine runs server-side. You get parsed results, not scraping headaches — no jsdom, no JVM, no bundle in-process. |
| 🔀 **Correct chapter order** | Built-in `nextChapter()` / `previousChapter()` work on both ascending (MangaDex `0→N`) and descending (scanlation `N→0`) sources — no off-by-one "next goes backwards" bug. |
| 🧰 **Batteries included** | A CLI, an interactive terminal reader (TUI), a page downloader, and cross-device cloud sync — all in one `npm install`. |
| 🟦 **TypeScript-first** | Written in TS, Promise-based, works in Node 18+ and modern runtimes. |

<a name="install"></a>
## Install

```bash
npm install nyora-sdk       # or: pnpm add nyora-sdk / yarn add nyora-sdk
```

Node 18+. ESM (`import`). Nothing else — the parser engine lives in the cloud.

<a name="quickstart"></a>
## Quickstart — a working reader in 10 lines

```ts
import Nyora, { readingOrder } from "nyora-sdk";

const client = new Nyora();

const source = await client.sources.find("mangadex");          // any of 363 sources
const hits = await client.manga.search(source.id, "frieren");  // search it
const manga = hits.entries[0];

const details = await client.manga.details(source.id, manga.url, { title: manga.title });
const first = readingOrder(details.chapters)[0];               // earliest chapter, order-safe

const pages = await client.manga.pages(source.id, first.url, { branch: first.branch });
pages.forEach((p) => console.log(p.url));                      // image URLs, ready to render
```

That's a complete read path: **source → search → details → chapter → page images.**
Point an `<img>` (or a React Native / Electron / canvas view) at those URLs and you have a reader.

<a name="core-concepts"></a>
## Core concepts

A source exposes manga; a manga has chapters; a chapter has pages. Every step is one call.

```
Nyora ─┬─ sources → Source        (a content site: MangaDex, Bato, …)
       └─ manga   → Manga          (a series: title, coverUrl, authors, tags)
                   → MangaDetails  (Manga + its MangaChapter list)
                   → MangaChapter  (id, title, number, url, branch, uploadDate)
                   → MangaPage      (a single image url)
```

Every value is a plain typed object — `JSON.stringify()` to serialise, full `.d.ts` types throughout.

<a name="api-reference"></a>
## API reference

### Client

```ts
new Nyora(options?)   // options.baseUrl defaults to https://api.hasanraza.tech
```

Attributes: `client.sources`, `client.manga`, `client.cloud` (raw transport).

### `client.sources`

| Method | Returns | Description |
|---|---|---|
| `list()` | `Promise<Source[]>` | Loaded sources (dead ones hidden). |
| `catalog()` | `Promise<Source[]>` | Every available source (dead ones hidden). |
| `find(query)` | `Promise<Source>` | First source whose id or name matches (case-insensitive). |

### `client.manga`

| Method | Returns | Description |
|---|---|---|
| `popular(sourceId, page=1)` | `Promise<SearchPage>` | Popular titles from a source. |
| `latest(sourceId, page=1)` | `Promise<SearchPage>` | Recently updated titles. |
| `search(sourceId, query, page=1)` | `Promise<SearchPage>` | Search one source. |
| `details(sourceId, mangaUrl, { title? })` | `Promise<MangaDetails>` | Full metadata **+ chapter list**. |
| `pages(sourceId, chapterUrl, { branch? })` | `Promise<MangaPage[]>` | A chapter's image pages. |

`SearchPage` has `.entries: Manga[]` and `.hasNextPage: boolean` for pagination.

### Chapter ordering helpers

```ts
import { nextChapter, previousChapter, readingOrder, chapterReadingDelta } from "nyora-sdk";

nextChapter(chapters, current);      // -> MangaChapter | null
previousChapter(chapters, current);  // -> MangaChapter | null
readingOrder(chapters);              // -> MangaChapter[], earliest-first
chapterReadingDelta(chapters);       // -> 1 (ascending) or -1 (descending)
```

<a name="recipes"></a>
## Recipes

**Browse popular with pagination**

```ts
let page = await client.manga.popular(source.id, 1);
for (;;) {
  page.entries.forEach((m) => console.log(m.title));
  if (!page.hasNextPage) break;
  page = await client.manga.popular(source.id, page.number + 1);
}
```

**Read a chapter, then move to the next one (order-independent)**

```ts
let chapter = readingOrder(details.chapters)[0];
while (chapter) {
  const pages = await client.manga.pages(source.id, chapter.url, { branch: chapter.branch });
  render(pages);                                   // your UI
  chapter = nextChapter(details.chapters, chapter); // null at the end
}
```

**Download a chapter's pages**

```ts
import { writeFile } from "node:fs/promises";

const pages = await client.manga.pages(source.id, chapter.url, { branch: chapter.branch });
await Promise.all(
  pages.map(async (p, i) => {
    const buf = Buffer.from(await (await fetch(p.url)).arrayBuffer());
    await writeFile(`page-${String(i + 1).padStart(3, "0")}.jpg`, buf);
  }),
);
```

<a name="chapter-ordering"></a>
## Chapter ordering (ascending vs descending sources)

Different sources return chapters in different orders — MangaDex lists oldest-first
(`0 → N`), many scanlation sites list newest-first (`N → 0`). A naive `chapters[i+1]`
"next chapter" therefore goes **backwards** on half of all sources. Nyora detects the
direction from the chapter numbers so navigation is always correct:

```ts
const nxt = nextChapter(details.chapters, current);     // always the LATER chapter
const prv = previousChapter(details.chapters, current); // always the EARLIER chapter
```

<a name="cloud-sync"></a>
## Cloud sync — a library across devices

```ts
import { NyoraSync } from "nyora-sdk";

const sync = new NyoraSync();
await sync.signIn("you@example.com", "password");     // or register(...)
await sync.upsert("nyora_favourite", [{ manga_id: manga.url, sort_key: 0 }]);
const favs = await sync.select("nyora_favourite");     // syncs across every Nyora app
```

Same account and library as the Nyora apps on Android, iOS, macOS, Windows, Linux and web.

<a name="command-line"></a>
## Command line (`nyora-cli`)

```bash
npx nyora-cli sources --search mangadex        # list/filter sources
npx nyora-cli popular  -s MANGADEX             # popular titles
npx nyora-cli search   -s MANGADEX "frieren"   # search
npx nyora-cli details  -s MANGADEX <manga-url> # metadata + chapters
npx nyora-cli pages    -s MANGADEX <chap-url>  # page image URLs
npx nyora-cli download -s MANGADEX <chap-url>  # save pages
npx nyora-cli --json popular -s MANGADEX       # machine-readable output
```

Both `nyora` and `nyora-cli` binaries are installed. Add `--json` to any command for scripting.

<a name="terminal-reader"></a>
## Interactive terminal reader (TUI)

```bash
npx nyora            # launch the interactive reader — browse, search, read
```

Pick a source → search or browse → open a chapter → page through it, with
order-independent **next / previous chapter** navigation.

<a name="how-it-works"></a>
## How it works

`nyora-sdk` is a **thin cloud client**. It speaks a small typed REST API to the public
**Nyora cloud helper** (`https://api.hasanraza.tech`) — the kotatsu-parsers JVM engine
with hundreds of sources — so nothing runs in-process: no jsdom, no parser bundle, no
JVM, no Java. Dead and Cloudflare-blocked sources are filtered out client-side from a
periodically refreshed health-check, so you only ever see the **363 sources that actually
return content**. Self-host the helper and set `baseUrl` if you'd rather run your own.

<a name="faq"></a>
## FAQ

**How do I build a manga reader in JavaScript / TypeScript?**
`npm install nyora-sdk`, then `search → details → pages` (see [Quickstart](#quickstart)).
`client.manga.pages(...)` returns image URLs you can drop into an `<img>` or any UI.

**What's the best manga API / SDK?**
Nyora gives you 363 working, health-checked sources across 40 languages behind one typed
TypeScript API — no scraper maintenance, plus a CLI, TUI, downloader and cloud sync.

**Is this a Tachiyomi / Mihon / Kotatsu alternative?**
Yes — it's the *programmatic* one. Those are Android apps; Nyora is an importable SDK
(and cross-platform apps) built on the same open-source Kotatsu parser engine.

**Do I need to run a server, jsdom or a JVM?**
No. The engine is hosted. `npm install` and go. You *can* self-host and set `baseUrl`.

**Manga, manhwa or manhua?** All three — the sources cover Japanese, Korean and Chinese
comics across 40 languages.

**Python?** Use the sibling SDK: [`nyora`](https://pypi.org/project/nyora/) (`pip install nyora`).

<a name="ecosystem"></a>
## Ecosystem

- **Python SDK** — [`nyora`](https://pypi.org/project/nyora/) (`pip install nyora`)
- **Apps** — Android, iOS/iPadOS, macOS, Windows, Linux and a web app: <https://nyora.pages.dev>
- **Docs** — <https://nyora.pages.dev/docs/js/>
- **Source** — <https://github.com/Hasan72341/nyora-js>

## License

Apache-2.0. Nyora is built on the open-source Kotatsu parser engine and is not affiliated
with Tachiyomi, Mihon or Kotatsu.
