---
title: Sync
---

# Cloud sync (`NyoraSync`)

{@link NyoraSync} is the account + library sync client. It signs in against the
Nyora sync server (`https://stream.hasanraza.tech`) with an OAuth2 password grant
and a JWT, then does a generic last-write-wins `upsert`/`select` over your
per-user tables. Your favourites, history, and bookmarks follow you across every
Nyora client — the JS SDK, the CLI/TUI, and the mobile apps.

Sync is entirely optional and independent of the [`Nyora`](library.md) cloud
client: you can read manga without ever signing in.

## Import

```ts
import { NyoraSync } from "nyora-sdk";

// Types and helpers, if needed:
import type { SyncOptions } from "nyora-sdk";
import { SYNC_BASE_URL, SyncNotSignedInError } from "nyora-sdk";
```

## Construct

```ts
const sync = new NyoraSync();
```

Constructor options ({@link SyncOptions}, all optional):

```ts
new NyoraSync({
  baseUrl?: string,           // sync server; defaults to SYNC_BASE_URL or $NYORA_SYNC_URL
  timeoutMs?: number,         // per-request timeout (default 30_000)
  tokenPath?: string | null,  // where to persist tokens; null disables persistence
});
```

The base URL resolves from, in order: the `baseUrl` option, the `NYORA_SYNC_URL`
environment variable, then the public default (`https://stream.hasanraza.tech`,
exported as {@link SYNC_BASE_URL}).

## Token storage

On construction, `NyoraSync` loads any previously saved tokens, so a process can
stay signed in across runs. Tokens are written to:

```text
~/.config/nyora/sync.json
```

(or `$XDG_CONFIG_HOME/nyora/sync.json` when `XDG_CONFIG_HOME` is set). Pass a
custom `tokenPath` to change the location, or `tokenPath: null` to keep tokens in
memory only. The file stores the access token, refresh token, and email.

- {@link NyoraSync.isSignedIn} — `true` while an access token is held.
- {@link NyoraSync.email} — the signed-in email, or `null`.

## Authentication

### `register(email, password): Promise<void>`

Register a new account and store the returned tokens. The server may have
registration disabled, in which case this throws.

```ts
await sync.register("you@example.com", "password");
```

### `signIn(email, password): Promise<void>`

Sign in with the OAuth2 password grant and persist the tokens.

```ts
await sync.signIn("you@example.com", "password");
console.log(sync.isSignedIn); // true
```

### `signOut(): void`

Forget the stored tokens and delete the token file.

```ts
sync.signOut();
```

Access tokens are refreshed automatically: when a sync request returns `401` and
a refresh token is held, `NyoraSync` refreshes and retries once transparently.

## Library sync

Both methods require a signed-in client and throw {@link SyncNotSignedInError}
(exported as `SyncNotSignedInError`) otherwise.

### `upsert(table, rows): Promise<number>`

Last-write-wins upsert of `rows` into `table`. Returns the number of rows written
(0 for an empty `rows` array).

```ts
const now = new Date().toISOString();
await sync.upsert("nyora_favourite", [
  { manga_id: "…", added_at: now, sort_key: 0, updated_at: now },
]);
```

### `select(table, since?): Promise<Record<string, unknown>[]>`

Fetch rows from `table`. Pass an ISO timestamp `since` to fetch only rows changed
after that point (incremental pull).

```ts
const favs = await sync.select("nyora_favourite");
const changed = await sync.select("nyora_history", "2026-01-01T00:00:00.000Z");
```

## Tables

Sync operates over these per-user tables:

| Table | Holds |
|---|---|
| `nyora_manga` | Manga metadata (title, url, cover, authors, description, source ref). |
| `nyora_favourite` | Favourited manga (references `nyora_manga` by `manga_id`). |
| `nyora_history` | Reading history / progress. |
| `nyora_bookmark` | Per-chapter bookmarks. |

Rows are plain JSON objects; carry an `updated_at` ISO timestamp so the
last-write-wins merge resolves conflicts. Soft-deleted rows carry a `deleted_at`
timestamp (filter these out when reading a live library).

## End-to-end: favourite a manga

```ts
import { Nyora, NyoraSync } from "nyora-sdk";

const client = new Nyora();
const sync = new NyoraSync();
await sync.signIn("you@example.com", "password");

const source = await client.sources.find("mangadex");
const results = await client.manga.search(source.id, "Frieren");
const manga = results.entries[0];

const now = new Date().toISOString();
await sync.upsert("nyora_manga", [
  {
    id: manga.url,
    title: manga.title,
    url: manga.url,
    cover_url: manga.coverUrl ?? "",
    source_ref: JSON.stringify({ source: source.id }),
    updated_at: now,
  },
]);
await sync.upsert("nyora_favourite", [
  { manga_id: manga.url, added_at: now, sort_key: 0, updated_at: now },
]);

// Later, pull it back:
const favs = (await sync.select("nyora_favourite")).filter((f) => !f.deleted_at);
```

## In the TUI

The [terminal reader](tui.md) wraps this same client:

- Type `sync` (or pick **⚙ account (sync)**) to sign in or out.
- After opening a manga's details while signed in, answer **"Favourite to
  library?"** to push it with `upsert`.
- Type `lib` (or pick **★ library**) to browse your synced favourites.

## API reference

- {@link NyoraSync} — the sync client.
- {@link SyncOptions} — constructor options.
- {@link SYNC_BASE_URL} — the default sync server URL.
