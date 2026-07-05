---
title: Quickstart
---

# Quickstart

Get from zero to reading manga URLs in a couple of minutes. This page covers the
**library**, the **`nyora-cli`** tool, and **cloud sync** — the same
`npm install` ships them all.

## Requirements

- **Node.js 18 or newer** (developed and tested on Node 18–26).
- A network connection: the SDK is a thin client over the Nyora cloud helper
  (`https://api.hasanraza.tech`).

## Install

### As a library dependency

```bash
npm install nyora-sdk
```

Then import it (ESM — the package is `"type": "module"`):

```ts
import { Nyora } from "nyora-sdk";
```

### As a global command-line tool

```bash
npm install -g nyora-sdk
```

This puts `nyora-cli` (and the `nyora` alias) on your `PATH`.

## First script (library)

```ts
import { Nyora } from "nyora-sdk";

const client = new Nyora();

// 1. Resolve a source by id or fuzzy name.
const source = await client.sources.find("mangadex");

// 2. Browse it.
const page = await client.manga.popular(source.id);
const entry = page.entries[0];
console.log("Top result:", entry.title);

// 3. Fetch details + chapters.
const details = await client.manga.details(source.id, entry.url, { title: entry.title });
console.log("Chapters:", details.chapters.length);

// 4. Resolve a chapter's page image URLs.
const pages = await client.manga.pages(source.id, details.chapters[0].url);
for (const p of pages) console.log(p.url);

client.close();   // no-op, kept for API compatibility
```

Every method is `async` and returns typed objects ({@link SearchPage},
{@link MangaDetails}, {@link MangaPage}[]). See the **[Library guide](library.md)**
for the full surface.

## First run (CLI)

```bash
# List or filter sources.
nyora-cli sources --search asura

# Browse and search a source.
nyora-cli popular -s mangadex
nyora-cli search -s asura "Solo Leveling"

# Drill into a manga and a chapter.
nyora-cli details -s mangadex "<manga-url>"
nyora-cli pages   -s mangadex "<chapter-url>"

# Download a chapter as a .cbz archive (writes ./out/<slug>.cbz).
nyora-cli download -s mangadex -o ./out "<chapter-url>"
```

Add `--json` before the subcommand for machine-readable output:

```bash
nyora-cli --json popular -s mangadex
```

Run `nyora-cli` with **no subcommand** to launch the interactive terminal reader
(the [TUI](tui.md)).

## Sync your library

Sign in against the Nyora sync server to keep favourites, history, and bookmarks
across devices:

```ts
import { NyoraSync } from "nyora-sdk";

const sync = new NyoraSync();
await sync.signIn("you@example.com", "password");   // tokens persist to ~/.config/nyora/sync.json
await sync.upsert("nyora_favourite", [
  { manga_id: "…", added_at: new Date().toISOString() },
]);
const favs = await sync.select("nyora_favourite");
```

In the TUI, type `sync` to open the account menu and `lib` to browse the synced
library. See the **[Sync guide](sync.md)** for details.

## Point at your own helper

By default the client talks to `https://api.hasanraza.tech`. Override it per
client or with an environment variable:

```ts
const client = new Nyora({ baseUrl: "http://127.0.0.1:8080" });
```

```bash
NYORA_BASE_URL=http://127.0.0.1:8080 nyora-cli sources
```

## Next steps

- **[Library](library.md)** — every service method, types, and error handling.
- **[CLI](cli.md)** — the full command manual with exit codes and recipes.
- **[Sync](sync.md)** — account + library sync with `NyoraSync`.
- **[Agents](agents.md)** — drive Nyora from an AI agent or script.
