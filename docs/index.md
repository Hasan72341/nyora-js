---
title: Nyora for JavaScript
---

# Nyora — JavaScript / TypeScript

### Read like the world can wait.

The official **Node.js** package for [Nyora](https://nyora.pages.dev) — script your library,
search 1000+ manga sources, and fetch chapters and pages straight from
JavaScript or TypeScript. Self-contained: no JVM, no desktop app, no Java. Just
`npm install`.

```bash
npm install nyora
```

This single install gives you **two** things, documented as clearly separate surfaces:

1. A **library** you import (`import { Nyora } from "nyora"`).
2. The **`nyora-cli`** command-line tool (and its terminal reader / TUI).

> Looking for the Python twin? See **[nyora.pages.dev/docs/python](https://nyora.pages.dev/docs/python/)**.

---

## How it works

Nyora runs the full Nyora **JavaScript parser bundle** in-process inside a
[`jsdom`](https://github.com/jsdom/jsdom) window. HTTP is handled by Node's
native `fetch`, HTML parsing by jsdom, and SHA-256 verification by `node:crypto`
— so there is nothing to compile and no companion app to launch. The parser
bundle and source catalog update **over the air** (OTA), so new and fixed
sources arrive without upgrading the package. A pinned copy of the bundle ships
inside the package, so it also works fully offline on first run.

---

## Two paths

### Library (`npm install nyora`)

Import the SDK and drive the engine from your own code:

```ts
import { Nyora } from "nyora";

const client = new Nyora();
try {
  const source = client.sources.find("mangadex");        // resolve by id or fuzzy name
  const page = await client.manga.popular(source.id);    // SearchPage of entries
  const entry = page.entries[0];

  const details = await client.manga.details(source.id, entry.url, { title: entry.title });
  const pages = await client.manga.pages(source.id, details.chapters[0].url);

  for (const p of pages) console.log(p.url);
} finally {
  client.close();
}
```

The client exposes two typed services:

- [`client.sources`](library.md) — `list()` the full bundled catalog, or `find(...)` a source by **id** or fuzzy **name**.
- [`client.manga`](library.md) — `popular(...)`, `latest(...)`, `search(...)`, `details(...)`, and `pages(...)`.

→ **[Library guide](library.md)** · API reference: {@link Nyora}, {@link MangaService}, {@link SourcesService}

### Command line (`nyora-cli`)

Install globally to get the `nyora-cli` command:

```bash
npm install -g nyora
```

```bash
nyora-cli                              # bare command launches the interactive TUI
nyora-cli sources --search asura       # list/filter sources
nyora-cli popular -s mangadex          # browse a source
nyora-cli --json search -s asura "Solo Leveling"
nyora-cli serve --port 0               # run the helper-compatible REST server
```

→ **[CLI guide](cli.md)** · **[TUI guide](tui.md)**

---

## Guides

| Guide | What it covers |
|---|---|
| **[Quickstart](quickstart.md)** | Install, first script, first CLI run. |
| **[Library](library.md)** | The `Nyora` SDK: every service method, types, errors, OTA. |
| **[CLI](cli.md)** | The complete `nyora-cli` manual — every subcommand, flags, exit codes, recipes. |
| **[TUI](tui.md)** | The interactive terminal reader: start, flow, navigation, non-TTY behavior. |
| **[Server](server.md)** | `NyoraServer` + `nyora-cli serve`: endpoints, `helper.port`, attach example. |
| **[OTA](ota.md)** | `OtaManager`: updates, cache, SHA-256 verification, offline fallback. |
| **[Agents](agents.md)** | Using Nyora from an AI agent / programmatically, with an intent cheat-sheet. |

---

## API reference

The full typed API is generated from the source by TypeDoc. Start with:

- {@link Nyora} — the default SDK client.
- {@link SourcesService} · {@link MangaService} — the two service surfaces.
- {@link OtaManager} — over-the-air updates.
- {@link ParserRuntime} — the embedded jsdom parser engine.
- {@link NyoraServer} — the helper-compatible REST server.
- Models: {@link Source}, {@link Manga}, {@link MangaChapter}, {@link MangaPage}, {@link SearchPage}, {@link MangaDetails}.

---

## Links

- 📖 Full docs: **[nyora.pages.dev/docs/js](https://nyora.pages.dev/docs/js/)**
- 🐍 Python twin: **[nyora.pages.dev/docs/python](https://nyora.pages.dev/docs/python/)**
- 🌐 Website: **[nyora.pages.dev](https://nyora.pages.dev)**

Licensed under **GPL-3.0-only**. Nyora is not affiliated with any of the manga
sources it can access.
