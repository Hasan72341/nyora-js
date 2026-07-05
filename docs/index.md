---
title: Nyora for JavaScript
---

# Nyora — JavaScript / TypeScript

### Read like the world can wait.

The official **Node.js** package for [Nyora](https://nyora.pages.dev) — script your library,
search ~960 manga sources, and fetch chapters and pages straight from
JavaScript or TypeScript. A thin **cloud client**: no local engine to compile, no
companion app to launch. Just `npm install`.

```bash
npm install nyora-sdk
```

This single install gives you **three** things, documented as clearly separate surfaces:

1. A **library** you import (`import { Nyora } from "nyora-sdk"`).
2. The **`nyora-cli`** command-line tool (and its terminal reader / TUI).
3. **Cloud sync** (`NyoraSync`) — account + library sync across devices.

> Looking for the Python twin? See **[nyora.pages.dev/docs/python](https://nyora.pages.dev/docs/python/)**.

---

## How it works

Nyora is a **cloud-only** SDK. The default {@link Nyora} client is a thin wrapper
over Node's native `fetch` that talks to the Nyora cloud helper
(`https://api.hasanraza.tech`). The helper runs the kotatsu-parsers engine
(~960 sources) server-side, so the package has nothing to compile and no
companion app to launch. Point the client at your own helper by passing
`baseUrl` or setting `NYORA_BASE_URL`.

A separate {@link NyoraSync} client signs in against the Nyora sync server
(`https://stream.hasanraza.tech`) so your favourites, history, and bookmarks
follow you across devices.

---

## Three paths

### Library (`npm install nyora-sdk`)

Import the SDK and drive the cloud helper from your own code:

```ts
import { Nyora } from "nyora-sdk";

const client = new Nyora();
const source = await client.sources.find("mangadex");   // resolve by id or fuzzy name
const page = await client.manga.popular(source.id);     // SearchPage of entries
const entry = page.entries[0];

const details = await client.manga.details(source.id, entry.url, { title: entry.title });
const pages = await client.manga.pages(source.id, details.chapters[0].url);

for (const p of pages) console.log(p.url);
client.close();   // no-op, kept for API compatibility
```

The client exposes two typed services:

- [`client.sources`](library.md) — `list()` the loaded sources, `catalog()` the full catalog, or `find(...)` a source by **id** or fuzzy **name**.
- [`client.manga`](library.md) — `popular(...)`, `latest(...)`, `search(...)`, `details(...)`, and `pages(...)`.

→ **[Library guide](library.md)** · API reference: {@link Nyora}, {@link MangaService}, {@link SourcesService}

### Command line (`nyora-cli`)

Install globally to get the `nyora-cli` command:

```bash
npm install -g nyora-sdk
```

```bash
nyora-cli                              # bare command launches the interactive TUI
nyora-cli sources --search asura       # list/filter sources
nyora-cli popular -s mangadex          # browse a source
nyora-cli --json search -s asura "Solo Leveling"
nyora-cli download -s mangadex "<chapter-url>"   # save a chapter as .cbz
```

→ **[CLI guide](cli.md)** · **[TUI guide](tui.md)**

### Cloud sync (`NyoraSync`)

Sign in once and sync your library across devices:

```ts
import { NyoraSync } from "nyora-sdk";

const sync = new NyoraSync();
await sync.signIn("you@example.com", "password");
await sync.upsert("nyora_favourite", [{ manga_id: "…", added_at: new Date().toISOString() }]);
const favs = await sync.select("nyora_favourite");
```

→ **[Sync guide](sync.md)** · API reference: {@link NyoraSync}

---

## Guides

| Guide | What it covers |
|---|---|
| **[Quickstart](quickstart.md)** | Install, first script, first CLI run. |
| **[Library](library.md)** | The `Nyora` cloud client: every service method, types, and errors. |
| **[CLI](cli.md)** | The complete `nyora-cli` manual — every subcommand, flags, exit codes, recipes. |
| **[TUI](tui.md)** | The interactive terminal reader: start, flow, navigation, sync, non-TTY behavior. |
| **[Sync](sync.md)** | `NyoraSync`: register / sign in, `upsert`/`select`, tables, token storage. |
| **[Agents](agents.md)** | Using Nyora from an AI agent / programmatically, with an intent cheat-sheet. |

---

## API reference

The full typed API is generated from the source by TypeDoc. Start with:

- {@link Nyora} — the default cloud SDK client.
- {@link SourcesService} · {@link MangaService} — the two service surfaces.
- {@link NyoraSync} — cloud account + library sync.
- {@link CloudClient} — the underlying `fetch` transport.
- Models: {@link Source}, {@link Manga}, {@link MangaChapter}, {@link MangaPage}, {@link SearchPage}, {@link MangaDetails}.

---

## Also in the Nyora family

- **nyora-mihon** — an on-device APK that brings ~900 sources to stock Mihon.
- **nyora-aidoku** — ~959 WASM `.aix` proxy sources for stock Aidoku.

---

## Links

- 📖 Full docs: **[nyora.pages.dev/docs/js](https://nyora.pages.dev/docs/js/)**
- 🐍 Python twin: **[nyora.pages.dev/docs/python](https://nyora.pages.dev/docs/python/)**
- 🌐 Website: **[nyora.pages.dev](https://nyora.pages.dev)**

Licensed under **Apache-2.0**. Nyora is not affiliated with any of the manga
sources it can access.
