<div align="center">

<img src="https://nyora.pages.dev/icon.png" width="120" alt="Nyora" />

# Nyora — JavaScript

### Read like the world can wait.

The official **Node.js / TypeScript** SDK for **Nyora** — a thin cloud client
that scripts your library, browses **~960 manga sources**, and fetches chapters
and pages straight from JavaScript. `npm install`, create a client, done.

<p>
  <img alt="Node.js" src="https://img.shields.io/badge/Node.js-%3E%3D18-339933?style=for-the-badge&logo=node.js&logoColor=white" />
  <a href="https://www.npmjs.com/package/nyora-sdk"><img alt="npm version" src="https://img.shields.io/npm/v/nyora-sdk?style=for-the-badge&logo=npm&logoColor=white" /></a>
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" />
  <a href="https://www.apache.org/licenses/LICENSE-2.0"><img alt="License: Apache 2.0" src="https://img.shields.io/badge/License-Apache_2.0-blue.svg?style=for-the-badge" /></a>
</p>

</div>

---

## What it is

`nyora-sdk` is a **thin cloud client** for the Nyora manga engine. It talks to the
public **Nyora cloud helper** at `https://api.hasanraza.tech` — the
kotatsu-parsers JVM engine with **~960 sources** — over a small typed REST API.
Nothing runs in-process: no jsdom, no parser bundle, no JVM, no Java. A bare
`new Nyora()` points at the cloud by default, so you get the full catalog the
moment you install.

This one install gives you three surfaces:

- a **library** you `import { Nyora } from "nyora-sdk"` to script from your code,
- the **`nyora-cli`** command (one-shot subcommands + JSON output),
- a **terminal reader (TUI)**, plus **Nyora Cloud Sync** for a signed-in library.

```bash
npm install nyora-sdk
```

The package is ESM (`"type": "module"`) and ships TypeScript declarations.

📖 Full documentation: **[nyora.pages.dev/docs/js](https://nyora.pages.dev/docs/js/)**

---

## Quickstart

```ts
import { Nyora } from "nyora-sdk";

const client = new Nyora();                              // defaults to the Nyora cloud
const source = await client.sources.find("mangadex");    // resolve by id or fuzzy name
const page = await client.manga.popular(source.id);      // SearchPage of entries
const entry = page.entries[0];

const details = await client.manga.details(source.id, entry.url, { title: entry.title });
const pages = await client.manga.pages(source.id, details.chapters[0].url);

for (const p of pages) console.log(p.url);               // page image URLs
client.close();                                          // no-op, kept for symmetry
```

The client exposes two typed services:

- **`client.sources`** — `list()` the loaded sources, `catalog()` the full
  ~960-source catalog, or `find(query)` by **id** or fuzzy **name**.
- **`client.manga`** — `popular(...)`, `latest(...)`, `search(...)`,
  `details(...)`, and `pages(...)`.

### List and search sources

```ts
import { Nyora } from "nyora-sdk";

const client = new Nyora();

for (const src of (await client.sources.catalog()).slice(0, 10)) {
  console.log(src.id, src.name, src.lang);
}

const src = await client.sources.find("asura");
const results = await client.manga.search(src.id, "Solo Leveling");
console.log(results.entries[0].title);
```

### Browse popular / latest

```ts
const src = (await client.sources.find("mangadex")).id;

const popular = await client.manga.popular(src, 1);
const latest = await client.manga.latest(src, 1);

for (const entry of popular.entries.slice(0, 5)) {
  console.log(entry.title, "—", entry.url);
}
```

### Details and pages

```ts
const src = (await client.sources.find("mangadex")).id;
const entry = (await client.manga.popular(src)).entries[0];

const details = await client.manga.details(src, entry.url);   // metadata + chapter list
console.log(details.manga.title, "-", details.chapters.length, "chapters");

const pages = await client.manga.pages(src, details.chapters[0].url, { branch: undefined });
console.log(pages.map((p) => p.url));
```

> Point the client somewhere else with `new Nyora({ baseUrl })` or the
> `NYORA_BASE_URL` environment variable — otherwise it uses
> `https://api.hasanraza.tech`.

---

## Cloud Sync

`NyoraSync` is Nyora's account + library sync. It signs in against the sync
server `https://stream.hasanraza.tech` (OAuth2 password grant + rotating JWT),
then does last-write-wins `upsert`/`select` over your per-user tables
(`nyora_manga`, `nyora_favourite`, `nyora_history`, `nyora_bookmark`, …). **One
account is shared across the iOS app, the TUI, and the SDKs** — favourite a manga
anywhere and it shows up everywhere.

```ts
import { NyoraSync } from "nyora-sdk";

const sync = new NyoraSync();                       // -> https://stream.hasanraza.tech

await sync.register("me@example.com", "hunter2");   // or sync.signIn(...) if you have an account
await sync.signIn("me@example.com", "hunter2");

// Push favourites (last-write-wins upsert)
await sync.upsert("nyora_favourite", [
  { manga_id: "abc123", source: "mangadex", title: "Solo Leveling" },
]);

// Pull them back (optionally only rows changed after an ISO timestamp)
const rows = await sync.select("nyora_favourite");
console.log(rows);

sync.signOut();
```

- **Methods:** `register`, `signIn`, `signOut`, `upsert(table, rows)`,
  `select(table, since?)`, plus the `isSignedIn` getter.
- **Tokens persist** to `~/.config/nyora/sync.json` (respects `XDG_CONFIG_HOME`),
  so a session survives restarts. `signOut()` deletes them.
- Access tokens auto-refresh on a `401` using the stored refresh token.

---

## Command line (`nyora-cli`)

Install globally to put `nyora-cli` (aliased as `nyora`) on your `PATH`:

```bash
npm install -g nyora-sdk
```

> **Running bare `nyora-cli` launches the terminal reader (TUI).** Pass a
> subcommand for a one-shot command instead. Without a global install, run it as
> `node dist/cli.js <command>` or `npx nyora-sdk <command>`.

```bash
nyora-cli                                    # no subcommand -> launches the TUI
nyora-cli sources --search asura
nyora-cli popular -s mangadex
nyora-cli search  -s asura "Solo Leveling"
nyora-cli details -s mangadex "<manga-url>"
nyora-cli pages   -s mangadex "<chapter-url>"
nyora-cli download -s mangadex -o ./out "<chapter-url>"   # save chapter as a .cbz
nyora-cli version
```

Add `--json` before any subcommand for machine-readable output:

```bash
nyora-cli --json popular -s mangadex | jq '.entries[].title'
```

When stdout is not a TTY (piped, redirected, CI), bare `nyora-cli` prints a
friendly notice and exits `0` instead of starting the TUI.

---

## Terminal reader (TUI)

Run bare `nyora-cli` (or `node dist/cli.js`) to open the terminal reader: pick a
source, browse popular/latest/search, open a title, and page through a chapter.

The TUI is also the front-end for **Cloud Sync**:

- Type **`sync`** at the source filter to open the account menu (sign in /
  register / sign out).
- Type **`lib`** to browse your synced library.
- When signed in, a manga's details show a **"Favourite to library?"** prompt —
  favourites sync to your cloud account.

---

## Installation

```bash
npm install nyora-sdk        # as a dependency (library + nyora-cli)
npm install -g nyora-sdk     # global: puts `nyora-cli` (and `nyora`) on PATH
```

Requires **Node.js 18+** and a network connection (all catalog/parsing work
happens on the Nyora cloud helper).

---

## Also from Nyora

Nyora is a complete manga ecosystem — native apps for Android/iOS/macOS/Windows/
Linux/Web, a Python SDK (`pip install nyora`), and drop-in extensions:
**[nyora-mihon](https://github.com/Hasan72341/nyora-mihon)** brings the whole
catalog to stock Mihon and **[nyora-aidoku](https://github.com/Hasan72341/nyora-aidoku)**
brings it to stock Aidoku on iOS — no app modification required.

---

## Privacy & license

No ads, no tracking, no telemetry. `nyora-sdk` is fully auditable, Apache-2.0
open-source code. Developed and maintained by **Md Hasan Raza** —
[GitHub](https://github.com/Hasan72341).

> Nyora is not affiliated with any of the manga sources it can access.
