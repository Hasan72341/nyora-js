---
title: Library
---

# Library (`npm install nyora-sdk`)

The importable **Nyora SDK** drives Nyora's ~960 sources from your own Node.js
code. It is a thin **cloud client**: the default {@link Nyora} client talks to the
Nyora cloud helper (`https://api.hasanraza.tech`) over Node's native `fetch`. The
helper runs the parser engine server-side, so there is nothing to compile and no
companion app to launch.

This guide documents the SDK surface. For the separate command-line tool, see the
**[CLI guide](cli.md)**; for account + library sync, see the **[Sync guide](sync.md)**.

## Import surface

Everything you typically need is a named export from `nyora-sdk`:

```ts
import {
  Nyora,            // default client (also the default export)
  SourcesService,   // client.sources
  MangaService,     // client.manga
  CloudClient,      // the underlying fetch transport
  NyoraSync,        // cloud account + library sync
  NyoraError,       // base error
  NyoraHTTPError,
} from "nyora-sdk";

// Types are exported too:
import type {
  Source, Manga, MangaChapter, MangaPage, SearchPage, MangaDetails,
  CloudOptions, SyncOptions,
} from "nyora-sdk";
```

`Nyora` is also the **default export**:

```ts
import Nyora from "nyora-sdk";
```

## The `Nyora` client

Create a client and call its `async` service methods. `close()` is a no-op kept
for API compatibility — `fetch` needs no teardown.

```ts
import { Nyora } from "nyora-sdk";

const client = new Nyora();
// ... use client.sources and client.manga ...
client.close();   // no-op
```

A `Nyora` instance owns:

- {@link Nyora.sources} — a {@link SourcesService}.
- {@link Nyora.manga} — a {@link MangaService}.
- {@link Nyora.cloud} — the underlying {@link CloudClient} transport.

Constructor options ({@link CloudOptions}, all optional):

```ts
new Nyora({
  baseUrl?: string,    // helper base URL; defaults to CLOUD_BASE_URL or $NYORA_BASE_URL
  timeoutMs?: number,  // per-request timeout (default 120_000)
});
```

## `client.sources` — {@link SourcesService}

### `list(): Promise<Source[]>`

Return the sources currently loaded on the helper.

```ts
const sources = await client.sources.list();
console.log(sources.length, "sources");
console.log(sources[0]); // { id, name, lang, baseUrl, engine, isNsfw, ... }
```

### `catalog(): Promise<Source[]>`

Return every source in the catalog, loaded or not.

```ts
const all = await client.sources.catalog();
```

### `find(query: string): Promise<Source>`

Resolve a source over the full catalog by a **case-insensitive** id or name
substring. Throws if nothing matches.

```ts
const source = await client.sources.find("asura");    // by fuzzy name
const md = await client.sources.find("mangadex");       // by id
```

> Throws a plain `Error` (`No source matched '<query>'`) when there is no match —
> wrap it in `try/catch` if the query is user-supplied.

A {@link Source} has the shape:

```ts
interface Source {
  id: string;            // stable identifier (use this for manga calls)
  name: string;          // human-readable name
  lang: string;          // locale code, e.g. "en"
  baseUrl: string;       // site base URL
  engine: string;
  contentType: string;   // "Manga"
  isInstalled: boolean;
  isPinned: boolean;
  isNsfw: boolean;
  isObsolete: boolean;
  iconUrl: string;
  version: string;
  notes: string;
  canUninstall: boolean;
}
```

## `client.manga` — {@link MangaService}

All methods are `async` and take the **source id** (`source.id`) as the first
argument. If a source is not yet loaded on the helper, the client asks the helper
to install it and retries once, transparently.

### `popular(sourceId, page = 1): Promise<SearchPage>`

```ts
const page = await client.manga.popular(source.id);          // page 1
const page2 = await client.manga.popular(source.id, 2);      // page 2
for (const m of page.entries) console.log(m.title, m.url);
console.log("more pages:", page.hasNextPage);
```

### `latest(sourceId, page = 1): Promise<SearchPage>`

Newest updated manga from the source.

```ts
const recent = await client.manga.latest(source.id);
```

### `search(sourceId, query, page = 1): Promise<SearchPage>`

```ts
const results = await client.manga.search(source.id, "Solo Leveling");
const hit = results.entries[0];
```

A {@link SearchPage} is:

```ts
interface SearchPage {
  entries: Manga[];
  hasNextPage: boolean;
}
```

### `details(sourceId, mangaUrl, options?): Promise<MangaDetails>`

Fetch full metadata plus the chapter list. Pass the known `title` to help the
helper resolve the entry.

```ts
const details = await client.manga.details(source.id, hit.url, { title: hit.title });
console.log(details.manga.description);
console.log(details.chapters.length, "chapters");
```

A {@link MangaDetails} is `{ manga: Manga, chapters: MangaChapter[] }`. The
{@link Manga} carries `title`, `altTitles`, `authors`, `description`, `tags`,
`coverUrl`, `state`, `isNsfw`, and more; each {@link MangaChapter} carries `id`,
`title`, `number`, `volume`, `url`, `scanlator`, `uploadDate`, and `branch`.

### `pages(sourceId, chapterUrl, options?): Promise<MangaPage[]>`

Resolve the ordered list of readable image pages for a chapter. Pass
`{ branch }` to select a scanlation branch/translation.

```ts
const pages = await client.manga.pages(source.id, details.chapters[0].url);
for (const p of pages) {
  console.log(p.url);       // image URL
  console.log(p.headers);   // request headers (e.g. { Referer: "..." })
}

// With a specific scanlation branch:
const branchPages = await client.manga.pages(source.id, chapter.url, {
  branch: chapter.branch,
});
```

A {@link MangaPage} is `{ url: string, headers: Record<string, string> }`. Some
sources require the `headers` (notably `Referer`) when you download the image.

## End-to-end

```ts
import { Nyora } from "nyora-sdk";

const client = new Nyora();
const source = await client.sources.find("mangadex");
const results = await client.manga.search(source.id, "Frieren");
const first = results.entries[0];

const { manga, chapters } = await client.manga.details(source.id, first.url, {
  title: first.title,
});
console.log(manga.title, "—", chapters.length, "chapters");

const pages = await client.manga.pages(source.id, chapters[0].url);
console.log(pages.map((p) => p.url));
```

## Configuration

The client resolves its helper base URL from, in order: the `baseUrl` option, the
`NYORA_BASE_URL` environment variable, then the public default
(`https://api.hasanraza.tech`, exported as {@link CLOUD_BASE_URL}).

```ts
// Explicit base URL:
const client = new Nyora({ baseUrl: "http://127.0.0.1:8080" });

// Or via the environment:
//   NYORA_BASE_URL=http://127.0.0.1:8080 node app.js
```

## Error handling

The SDK exposes a small, typed error hierarchy (all extend {@link NyoraError}):

| Error | Thrown when |
|---|---|
| {@link NyoraError} | Base class for SDK failures. |
| {@link NyoraHTTPError} | The helper returned a non-2xx HTTP response (carries `statusCode`, `body`). |
| {@link HelperNotFoundError} | No running local helper could be discovered (port-file helpers). |
| `Error` | `sources.find(...)` found no match, or a helper request failed with a message. |

```ts
import { Nyora, NyoraError } from "nyora-sdk";

const client = new Nyora();
try {
  const page = await client.manga.popular("does-not-exist");
} catch (err) {
  if (err instanceof NyoraError) {
    console.error("nyora error:", err.message);
  } else {
    console.error("request failed:", (err as Error).message);
  }
}
```

## Sync

Account and library sync live in a separate {@link NyoraSync} client that talks to
the Nyora sync server (`https://stream.hasanraza.tech`):

```ts
import { NyoraSync } from "nyora-sdk";

const sync = new NyoraSync();
await sync.signIn("you@example.com", "password");
const favs = await sync.select("nyora_favourite");
```

See the **[Sync guide](sync.md)** for the full surface.
