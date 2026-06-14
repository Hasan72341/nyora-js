---
title: Quickstart
---

# Quickstart

Get from zero to reading manga URLs in a couple of minutes. This page covers the
**library** and the **`nyora-cli`** tool — the same `npm install` ships both.

## Requirements

- **Node.js 18 or newer** (developed and tested on Node 18–26).
- A network connection for source requests and OTA parser-bundle updates.
- No JVM, no desktop app, no Java. The parser engine runs in-process via jsdom.

## Install

### As a library dependency

```bash
npm install nyora
```

Then import it (ESM — the package is `"type": "module"`):

```ts
import { Nyora } from "nyora";
```

### As a global command-line tool

```bash
npm install -g nyora
```

This puts `nyora-cli` (and the `nyora` alias) on your `PATH`.

## First script (library)

```ts
import { Nyora } from "nyora";

const client = new Nyora();
try {
  // 1. Resolve a source by id or fuzzy name.
  const source = client.sources.find("mangadex");

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
} finally {
  // Always release the embedded jsdom runtime.
  client.close();
}
```

Every async method returns typed objects ({@link SearchPage}, {@link MangaDetails},
{@link MangaPage}[]). See the **[Library guide](library.md)** for the full surface.

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

## Keep parsers fresh

The parser bundle and source catalog update over the air:

```bash
nyora-cli update          # fetch the latest parser bundle (sha256-verified)
nyora-cli update --force  # re-download even if already current
nyora-cli version         # show package + installed OTA version
```

From code:

```ts
const result = await client.update();          // { updated, version, bundlePath, sourcesPath }
const status = await client.checkUpdate();     // { available, installed, latest }
```

See the **[OTA guide](ota.md)** for the cache layout and offline fallback.

## Next steps

- **[Library](library.md)** — every service method, types, and error handling.
- **[CLI](cli.md)** — the full command manual with exit codes and recipes.
- **[Server](server.md)** — run the helper-compatible REST API.
- **[Agents](agents.md)** — drive Nyora from an AI agent or script.
