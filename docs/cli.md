---
title: CLI
---

# `nyora-cli` — command-line manual

`nyora-cli` is the Nyora command-line tool. It drives the same Nyora cloud
helper as the [library](library.md) through a small subcommand tree, and it
doubles as the launcher for the interactive [terminal reader (TUI)](tui.md).

The `nyora` binary is an alias for `nyora-cli`.

## Install

```bash
npm install -g nyora-sdk     # global: puts `nyora-cli` (and `nyora`) on PATH
```

Or run without installing:

```bash
npx nyora-sdk sources
```

## Usage

```text
nyora-cli [--json] <command> [options]
nyora-cli                         launch the interactive terminal reader (TUI)
```

Running `nyora-cli` with **no subcommand** launches the [TUI](tui.md). With a
subcommand it runs that command and exits.

### Global options

| Option | Effect |
|---|---|
| `--json` | Emit raw JSON instead of pretty text. Place it **before** the subcommand. |
| `-h`, `--help` | Print usage and exit `0`. |

`-s`/`--source` accepts a **source id** or a fuzzy **name** (e.g. `asura`,
`mangadex`).

## Commands

### `sources` — list or filter sources

```text
nyora-cli sources [--search Q]
```

| Flag | Meaning |
|---|---|
| `--search Q` | Keep only sources whose id or name contains `Q` (case-insensitive). |

```bash
nyora-cli sources
nyora-cli sources --search asura
nyora-cli --json sources                 # array of Source objects
```

Text output is `id<TAB>name<TAB>lang`, ending with a `(N sources)` count.

### `search` — search a source

```text
nyora-cli search -s SRC [-p N] <query>
```

| Flag | Meaning |
|---|---|
| `-s`, `--source` | **Required.** Source id or fuzzy name. |
| `-p`, `--page` | Page number (default `1`). |

```bash
nyora-cli search -s asura "Solo Leveling"
nyora-cli search -s mangadex -p 2 "Frieren"
nyora-cli --json search -s asura "Solo Leveling"
```

### `popular` — popular manga from a source

```text
nyora-cli popular -s SRC [-p N]
```

```bash
nyora-cli popular -s mangadex
nyora-cli popular -s mangadex -p 3
```

### `latest` — latest updated manga

```text
nyora-cli latest -s SRC [-p N]
```

```bash
nyora-cli latest -s mangadex
```

`search`, `popular`, and `latest` print a numbered list of `title<TAB>url`, then
`(N entries[, more available])`. With `--json` they print a {@link SearchPage}.

### `details` — manga details and chapters

```text
nyora-cli details -s SRC <url>
```

```bash
nyora-cli details -s mangadex "https://mangadex.org/title/<id>"
nyora-cli --json details -s mangadex "<manga-url>"
```

Text output prints the title, authors, state, description, and a numbered chapter
list. JSON output is a {@link MangaDetails} (`{ manga, chapters }`).

### `pages` — chapter page image URLs

```text
nyora-cli pages -s SRC [--branch B] <url>
```

| Flag | Meaning |
|---|---|
| `--branch B` | Select a scanlation branch/translation. |

```bash
nyora-cli pages -s mangadex "<chapter-url>"
nyora-cli pages -s mangadex --branch "English" "<chapter-url>"
nyora-cli --json pages -s mangadex "<chapter-url>"     # array of MangaPage
```

### `download` — save a chapter as a `.cbz` archive

```text
nyora-cli download -s SRC [--branch B] [-o OUT] <url>
```

| Flag | Meaning |
|---|---|
| `-o`, `--out OUT` | Output path (`~` is expanded). If it ends in `.cbz` it is used as the file; otherwise it is treated as a **directory** that will contain `<chapter-slug>.cbz`. Default: `<chapter-slug>.cbz` in the current directory. |
| `--branch B` | Select a scanlation branch/translation. |

Downloads the chapter and writes a single **CBZ** archive — a standard *Comic
Book ZIP* readable by any comic reader (e.g. YACReader, CDisplayEx, Kavita) and
by the Nyora apps. The archive holds the page images in reading order, named
zero-padded with their original extension (`001.jpg`, `002.webp`, …, inferred
from the URL or `Content-Type`). Images are already compressed, so the ZIP uses
the *store* method; there is no extra dependency.

The chapter slug is derived from the last path segment of the chapter URL.

```bash
# default: writes <chapter-slug>.cbz in the current directory
nyora-cli download -s mangadex "<chapter-url>"

# -o as a directory: writes <chapter-slug>.cbz inside it
nyora-cli download -s mangadex -o ./out "<chapter-url>"

# -o as a file: writes exactly that .cbz
nyora-cli download -s mangadex -o "~/Comics/frieren-ch1.cbz" "<chapter-url>"

# machine-readable result
nyora-cli --json download -s mangadex "<chapter-url>"   # { file, pages, total }
```

Representative output:

```text
Saved 18/18 pages to /home/you/out/chapter-1.cbz
```

```json
{ "file": "/home/you/chapter-1.cbz", "pages": 18, "total": 18 }
```

The download uses each page's required `headers` (e.g. `Referer`) automatically.
Pages that fail to fetch are reported on stderr and skipped; the command exits
`0` if **any** page was packed into the archive, `1` if none could be
downloaded.

### `version` — show the package version

```text
nyora-cli version
```

```bash
nyora-cli version
nyora-cli --json version          # { package: "2.0.0" }
```

Prints the installed package version.

## Exit codes

| Code | Meaning |
|---|---|
| `0` | Success (or `--help`, or a clean TUI exit / non-TTY notice). |
| `1` | A handled error: missing/invalid flag, no results to download, or a helper/network failure. Printed as `error: <message>` on stderr (no stack trace). |
| `2` | Unknown command (usage is printed on stderr). |

## Recipes

**Find a source, then browse it, as JSON for a script:**

```bash
SRC=$(nyora-cli --json sources --search asura | node -pe 'JSON.parse(require("fs").readFileSync(0)).at(0).id')
nyora-cli --json popular -s "$SRC"
```

**Search → details → pages, piping JSON through `jq`:**

```bash
nyora-cli --json search -s mangadex "Frieren" | jq -r '.entries[0].url'
nyora-cli --json details -s mangadex "<manga-url>" | jq -r '.chapters[0].url'
nyora-cli --json pages   -s mangadex "<chapter-url>" | jq -r '.[].url'
```

**Download the first chapter of a search hit as a `.cbz` (shell glue):**

```bash
URL=$(nyora-cli --json search -s mangadex "Frieren" | jq -r '.entries[0].url')
CH=$(nyora-cli --json details -s mangadex "$URL" | jq -r '.chapters[0].url')
nyora-cli download -s mangadex -o ./frieren "$CH"            # writes ./frieren/<slug>.cbz
FILE=$(nyora-cli --json download -s mangadex "$CH" | jq -r '.file')   # capture the .cbz path
```

**Point at a self-hosted helper:**

```bash
NYORA_BASE_URL=http://127.0.0.1:8080 nyora-cli --json sources | jq 'length'
```

> When stdout is **not** a TTY (piped, redirected, CI), running bare `nyora-cli`
> does **not** start the TUI — it prints a short friendly notice and exits `0`.
> Use the subcommands above for scripting.
