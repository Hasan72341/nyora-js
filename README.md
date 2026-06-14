<div align="center">

<img src="https://nyora.pages.dev/icon.png" width="120" alt="Nyora" />

# Nyora — JavaScript

### Read like the world can wait.

The official **Node.js** package for **Nyora** — script your library, search
1000+ manga sources, and fetch chapters and pages straight from JavaScript or
TypeScript. Self-contained: no JVM, no desktop app, no Java. Just `npm install`.

<p>
  <img alt="Node.js" src="https://img.shields.io/badge/Node.js-%3E%3D18-339933?style=for-the-badge&logo=node.js&logoColor=white" />
  <a href="https://www.npmjs.com/package/nyora"><img alt="npm version" src="https://img.shields.io/npm/v/nyora?style=for-the-badge&logo=npm&logoColor=white" /></a>
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" />
</p>

<p>
  <a href="https://www.gnu.org/licenses/gpl-3.0"><img alt="License: GPL v3" src="https://img.shields.io/badge/License-GPLv3-blue.svg?style=for-the-badge" /></a>
  <a href="https://github.com/Hasan72341/nyora-js/stargazers"><img alt="Stars" src="https://img.shields.io/github/stars/Hasan72341/nyora-js?style=for-the-badge&logo=github&logoColor=white" /></a>
  <a href="https://github.com/Hasan72341/nyora-js/pulls"><img alt="PRs welcome" src="https://img.shields.io/badge/PRs-welcome-9d95ff?style=for-the-badge&logo=github&logoColor=white" /></a>
</p>

<p>
  <a href="https://nyora.pages.dev/docs/js/"><img alt="Documentation" src="https://img.shields.io/badge/Docs-nyora.pages.dev%2Fdocs%2Fjs-0ae448?style=for-the-badge&logo=readthedocs&logoColor=white" /></a>
  <a href="https://www.npmjs.com/package/nyora"><img alt="Install from npm" src="https://img.shields.io/badge/Install-npm_install_nyora-CB3837?style=for-the-badge&logo=npm&logoColor=white" /></a>
  <a href="https://nyora.pages.dev"><img alt="Website" src="https://img.shields.io/badge/Website-nyora.pages.dev-00bae2?style=for-the-badge&logo=githubpages&logoColor=white" /></a>
</p>

</div>

---

## About

Nyora is a fast, free, ad-free, open-source manga reader that runs on **every**
platform — with whole-page AI translation, 1000+ sources, offline downloads, and
free cloud sync across all your devices. `nyora` brings that same
source-and-parser engine to Node.js: an npm-installable library, a command-line
tool (`nyora-cli`), and a terminal reader (TUI).

It runs the full Nyora JavaScript parser bundle in-process inside a
[`jsdom`](https://github.com/jsdom/jsdom) window, with Node's native `fetch` for
HTTP and `node:crypto` for SHA-256 verification — nothing to compile and no
companion app to launch. The parser bundle and source catalog update **over the
air**, and a pinned copy ships in the package so it works fully offline on first
run.

📖 **Full documentation: [nyora.pages.dev/docs/js](https://nyora.pages.dev/docs/js/)**

```bash
npm install nyora
```

This single install gives you **both** surfaces below — a library you import and
the `nyora-cli` command-line tool. They are documented as clearly separate.

---

## Library (`npm install nyora`)

`import { Nyora } from "nyora"` to drive Nyora's source/parser engine from your
own code. Open a `Nyora()` client, find a source, search it, fetch details, and
resolve page image URLs — all with a clean, typed API. No JVM helper, no desktop
app, no Java.

```ts
import { Nyora } from "nyora";

const client = new Nyora();
try {
  const source = client.sources.find("mangadex");          // resolve by id or fuzzy name
  const page = await client.manga.popular(source.id);      // SearchPage of entries
  const entry = page.entries[0];

  const details = await client.manga.details(source.id, entry.url, { title: entry.title });
  const pages = await client.manga.pages(source.id, details.chapters[0].url);

  for (const p of pages) console.log(p.url);
} finally {
  client.close();
}
```

The client exposes two typed services:

- **`client.sources`** — `list()` the full bundled catalog, or `find(...)` a
  source by **id** or fuzzy **name** (e.g. `"asura"`).
- **`client.manga`** — `popular(...)`, `latest(...)`, `search(...)`,
  `details(...)`, and `pages(...)`.

The parser bundle and source catalog update **over the air**, so new and fixed
sources arrive without upgrading the package:

```ts
const status = await client.checkUpdate();   // { available, installed, latest }
if (status.available) await client.update(); // sha256-verified, then reloads the engine
```

You can also run the SDK **as a Nyora helper** (or attach to a running one) over
its REST contract:

```ts
import { NyoraServer, readBaseUrlFromPortFile } from "nyora";

const server = new NyoraServer({ port: 0 });
const baseUrl = await server.start();        // writes a helper.port file for discovery
// ... or: const baseUrl = readBaseUrlFromPortFile();
```

→ Library guide: **[/docs/js/documents/Library.html](https://nyora.pages.dev/docs/js/documents/Library.html)** ·
OTA: **[/docs/js/documents/OTA_updates.html](https://nyora.pages.dev/docs/js/documents/OTA_updates.html)** ·
Server: **[/docs/js/documents/Server.html](https://nyora.pages.dev/docs/js/documents/Server.html)**

---

## Command line (`nyora-cli`)

Install globally to get the `nyora-cli` command (aliased as `nyora`):

```bash
npm install -g nyora
```

Running **`nyora-cli` with no subcommand launches the interactive terminal
reader (the TUI)**. With a subcommand it runs that command and exits:

```bash
nyora-cli                              # launch the interactive TUI
nyora-cli sources --search asura       # list/filter sources
nyora-cli popular -s mangadex          # browse a source
nyora-cli search  -s asura "Solo Leveling"
nyora-cli details -s mangadex "<manga-url>"
nyora-cli pages   -s mangadex "<chapter-url>"
nyora-cli download -s mangadex -o ./out "<chapter-url>"   # save chapter as a .cbz archive
nyora-cli serve --host 127.0.0.1 --port 0     # helper-compatible REST server
nyora-cli update                       # apply over-the-air parser updates
nyora-cli version
```

Add `--json` before any subcommand for machine-readable output:

```bash
nyora-cli --json popular -s mangadex
```

`serve` binds the requested host/port (port `0` picks a free port), prints the
base URL, and writes a `helper.port` file so other Nyora processes can
auto-discover it. Endpoints include `/health`, `/sources`, `/sources/popular`,
`/sources/latest`, `/sources/search`, `/manga/details`, and `/manga/pages`.

When stdout is not a TTY (piped, redirected, CI), running bare `nyora-cli` prints
a friendly notice and exits `0` instead of starting the TUI.

→ CLI guide: **[/docs/js/documents/CLI.html](https://nyora.pages.dev/docs/js/documents/CLI.html)** ·
TUI guide: **[/docs/js/documents/TUI.html](https://nyora.pages.dev/docs/js/documents/TUI.html)** ·
Agents: **[/docs/js/documents/Agents.html](https://nyora.pages.dev/docs/js/documents/Agents.html)**

---

## Installation

```bash
npm install nyora        # as a dependency (library + nyora-cli)
npm install -g nyora     # global: puts `nyora-cli` (and `nyora`) on PATH
```

The package is ESM (`"type": "module"`) and ships TypeScript declarations.

### Requirements

- **Node.js 18 or newer** (developed and tested through Node 26).
- A network connection for source requests and OTA parser-bundle updates.

### Troubleshooting

- **`nyora-cli: command not found`** — install globally (`npm i -g nyora`) or run
  via `npx nyora ...`.
- **Stale or missing sources** — run `nyora-cli update` (or `--force`), then
  `nyora-cli version` to confirm the installed OTA version.
- **Permission errors writing the cache** — the OTA bundle is written into the
  user cache directory; make sure that location is writable for your user.

---

## What it can and cannot do

| Capability | Supported | Notes |
|---|---|---|
| List the full source catalog | Yes | `client.sources.list()` / `nyora-cli sources` |
| Resolve a source by id or fuzzy name | Yes | `client.sources.find(...)` |
| Popular / latest / search browsing | Yes | `client.manga.popular` · `.latest` · `.search` |
| Manga details + full chapter list | Yes | `client.manga.details(...)` |
| Resolve page image URLs | Yes | `client.manga.pages(...)` |
| Download a chapter as a `.cbz` archive | Yes | `nyora-cli download` (Comic Book ZIP) |
| Run as a REST helper / attach to one | Yes | `nyora-cli serve` · `NyoraServer` · `readBaseUrlFromPortFile()` |
| OTA self-update of sources | Yes | sha256-verified, atomic writes |
| Self-contained — no JVM / desktop app / Java | Yes | Runs the parser bundle in-process via jsdom |
| Host the consumer reading UI | No | Use the platform apps for a full reader |
| Bundled OCR / image translation pipeline | No | Translation lives in the consumer apps; the library gives you the page URLs to build on |
| Bypass a source's own access controls | No | It parses publicly accessible providers only |

---

## Documentation

The full, typed API reference and hand-written guides live at
**[nyora.pages.dev/docs/js](https://nyora.pages.dev/docs/js/)**:

- **Quickstart** — install, first script, first CLI run.
- **Library** — the `Nyora` SDK: every service method, types, errors, OTA.
- **CLI** — the complete `nyora-cli` manual (every subcommand, flags, exit codes).
- **TUI** — the interactive terminal reader.
- **Server** — `NyoraServer` + `nyora-cli serve`: endpoints, `helper.port`, attach.
- **OTA** — `OtaManager`: updates, cache, offline fallback.
- **Agents** — using Nyora from an AI agent / programmatically.

Looking for the Python twin? **[nyora.pages.dev/docs/python](https://nyora.pages.dev/docs/python/)**.

---

## Nyora on every platform

The Nyora reader is everywhere your screens are — and your library, history,
bookmarks, and progress sync for free across all of them.

| Platform | Repo | Get it |
|---|---|---|
| JavaScript / Node | [nyora-js](https://github.com/Hasan72341/nyora-js) **(you are here)** | [`npm install nyora`](https://www.npmjs.com/package/nyora) |
| Python | [nyora-python](https://github.com/Hasan72341/nyora-python) | [`pip3 install nyora`](https://pypi.org/project/nyora/) |
| Android | [nyora-android](https://github.com/Hasan72341/nyora-android) | [APK](https://github.com/Hasan72341/nyora-android/releases/latest) |
| macOS | [nyora-mac](https://github.com/Hasan72341/nyora-mac) | [.dmg / brew](https://github.com/Hasan72341/nyora-mac/releases/latest) |
| Windows | [nyora-windows](https://github.com/Hasan72341/nyora-windows) | [.exe (x64/ARM64)](https://github.com/Hasan72341/nyora-windows/releases/latest) |
| Linux | [nyora-linux](https://github.com/Hasan72341/nyora-linux) | [deb · rpm · curl](https://github.com/Hasan72341/nyora-linux/releases/latest) |
| iOS / iPadOS | [nyora-ios](https://github.com/Hasan72341/nyora-ios) | [sideload IPA](https://github.com/Hasan72341/nyora-ios/releases/latest) |
| Web | [nyora-web](https://github.com/Hasan72341/nyora-web) | [nyoraweb.pages.dev](https://nyoraweb.pages.dev) |

---

## Privacy & open source

Nyora is 100% free, ad-free, and contains no tracking. `nyora` is fully auditable
open-source code: there are no analytics, no telemetry, and no accounts. The only
network calls it makes are to the sources you ask for and to fetch the
sha256-verified OTA parser bundle. Licensed under **GPL-3.0-only**.

## Acknowledgements

Nyora's source and parser engine builds on the work of the open-source manga
community. `nyora` is developed and maintained by **Md Hasan Raza** —
[GitHub](https://github.com/Hasan72341).

## License

Licensed under **GPL-3.0-only**.

---

> Nyora is not affiliated with any of the manga sources it can access.
