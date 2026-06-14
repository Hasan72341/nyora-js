---
title: OTA updates
---

# Over-the-air updates (`OtaManager`)

Nyora's parser bundle and source catalog update **over the air** — new and fixed
sources arrive without a package release. {@link OtaManager} fetches a signed
manifest from the public feed, verifies each artifact by SHA-256, and writes the
bundle, catalog, and manifest **atomically** into a per-user cache. When nothing
is cached, reads fall back to the assets shipped inside the package, so the SDK
works fully offline on first run.

## The feed

The feed lives at `https://Hasan72341.github.io/nyora-ota-parsers` (exported as
{@link OTA_BASE}) and serves:

| File | Purpose |
|---|---|
| `manifest.json` | `{ "version": int, "bundle": { url, sha256, bytes }, "sources": { url, sha256, bytes } }` |
| `parsers.bundle.js` | The JavaScript parser bundle (~450 KB) defining the global `NyoraParsers`. |
| `sources.json` | The source catalog metadata (JSON array). |

## Quick use via the client

Most code just uses the {@link Nyora} client, which wraps the manager and reloads
the runtime after an update:

```ts
import { Nyora } from "nyora";

const client = new Nyora();

const status = await client.checkUpdate();   // { available, installed, latest }
if (status.available) {
  const result = await client.update();      // downloads, verifies, reloads runtime
  console.log("updated to OTA version", result.version);
}
client.close();
```

From the CLI:

```bash
nyora-cli update           # apply the latest (sha256-verified) parser bundle
nyora-cli update --force   # re-download even if already current
nyora-cli version          # show package + installed OTA version
```

## Using `OtaManager` directly

```ts
import { OtaManager } from "nyora";

const ota = new OtaManager();

// What's installed vs. what's available?
console.log(ota.installedVersion());            // number | null (null = bundled fallback)
const { available, installed, latest } = await ota.isUpdateAvailable();

// Apply an update.
const result = await ota.update();              // OtaUpdateResult
// { updated, version, bundlePath, sourcesPath }

// Read the current bundle/catalog text (cache, else bundled asset).
const bundleJs = ota.readBundleText();
const sourcesJson = ota.readSourcesText();
```

### Methods

| Method | Returns | Notes |
|---|---|---|
| `fetchManifest()` | `Promise<OtaManifest>` | Downloads & parses the manifest. Throws {@link NyoraError} on failure/invalid JSON. |
| `installedVersion()` | `number \| null` | Cached version, or `null` when nothing is cached. |
| `isUpdateAvailable()` | `Promise<OtaUpdateAvailability>` | Safe to call opportunistically — network errors resolve to "not available". |
| `update({ force? })` | `Promise<OtaUpdateResult>` | Downloads, SHA-256-verifies, writes atomically. Skips when current unless `force`. |
| `readBundleText()` | `string` | Cached bundle, else the package's bundled asset. |
| `readSourcesText()` | `string` | Cached catalog, else the package's bundled asset. |
| `cacheDir` (getter) | `string` | The directory holding cached OTA artifacts. |

Constructor options:

```ts
new OtaManager({
  cacheDir?: string,    // override the cache directory (default: per-user cache/ota)
  timeoutMs?: number,   // HTTP timeout for fetches (default: 30000)
});
```

## SHA-256 verification

Every downloaded artifact is hashed with `node:crypto` and compared against the
`sha256` advertised in the manifest. On a mismatch, `update()` throws a
{@link NyoraError} and **nothing is written** — the previous cache (or the bundled
fallback) stays intact. Files are written to a temporary path and `rename`d into
place, so a crash mid-download never leaves a half-written bundle.

## Cache location

By default the cache lives under the per-user cache directory in an `ota/`
subfolder (resolved via `env-paths('nyora')`):

| Platform | Cache directory |
|---|---|
| macOS | `~/Library/Caches/nyora/ota/` |
| Windows | `%LOCALAPPDATA%\nyora\Cache\ota\` |
| Linux / other | `$XDG_CACHE_HOME/nyora/ota/` |

It holds `parsers.bundle.js`, `sources.json`, and `manifest.json`. Override it
with the `cacheDir` constructor option.

## Offline fallback

A pinned copy of `parsers.bundle.js` and `sources.json` ships inside the package
(`assets/`). When the cache is empty, `readBundleText()` and `readSourcesText()`
transparently return those bundled assets — so:

- the SDK works **fully offline on first run** (no update needed to list sources
  or read manga), and
- the engine only reaches the network when you call `update()` / `checkUpdate()`,
  or when you make actual source requests.

After a successful `update()`, the cached copies take precedence over the bundled
assets until the next update.
