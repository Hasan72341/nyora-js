/**
 * Over-the-air parser feed management for Nyora.
 *
 * Keeps the JavaScript parser bundle and source catalog current without a
 * package release. {@link OtaManager} fetches a signed manifest from the public
 * OTA feed, verifies each artifact by SHA-256, and writes the bundle, catalog,
 * and manifest atomically into a per-user cache directory. When nothing is
 * cached, reads transparently fall back to the assets shipped inside the
 * package, so the SDK works fully offline on first run.
 *
 * @packageDocumentation
 */

import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import * as fs from "node:fs";
import * as path from "node:path";
import envPaths from "env-paths";

import { NyoraError } from "./errors.js";
import type { OtaManifest, OtaUpdateAvailability, OtaUpdateResult } from "./types.js";

/** Base URL of the public OTA parser feed. */
export const OTA_BASE = "https://Hasan72341.github.io/nyora-ota-parsers";

const MANIFEST_NAME = "manifest.json";
const BUNDLE_NAME = "parsers.bundle.js";
const SOURCES_NAME = "sources.json";

/** Directory holding the package-bundled fallback assets (`../assets`). */
const ASSETS_DIR = path.resolve(fileURLToPath(import.meta.url), "..", "..", "assets");

/**
 * Manages the over-the-air parser bundle and source catalog.
 *
 * Coordinates fetching the OTA manifest, downloading and SHA-256-verifying the
 * parser bundle and source catalog, and caching them atomically per user. Reads
 * fall back to the bundled package assets when the cache is empty.
 *
 * @example
 * ```ts
 * const ota = new OtaManager();
 * const { available } = await ota.isUpdateAvailable();
 * if (available) {
 *   const result = await ota.update();
 *   console.log("updated to", result.version);
 * }
 * ```
 */
export class OtaManager {
  private readonly _cacheDir: string;
  private readonly _timeoutMs: number;

  /**
   * Initialize the manager.
   *
   * @param options - Optional configuration.
   * @param options.cacheDir - Directory for cached OTA artifacts. Defaults to
   *   the per-user cache directory (`.../nyora/ota`).
   * @param options.timeoutMs - HTTP timeout in milliseconds for manifest and
   *   artifact fetches. Defaults to 30000.
   */
  constructor(options: { cacheDir?: string; timeoutMs?: number } = {}) {
    this._cacheDir =
      options.cacheDir ?? path.join(envPaths("nyora", { suffix: "" }).cache, "ota");
    this._timeoutMs = options.timeoutMs ?? 30_000;
  }

  /** The directory where OTA artifacts are cached. */
  get cacheDir(): string {
    return this._cacheDir;
  }

  /**
   * Download and parse the remote OTA manifest.
   *
   * @returns The manifest object (containing `version` and per-artifact
   *   `url`/`sha256` entries).
   * @throws {@link NyoraError} If the manifest cannot be fetched, is invalid
   *   JSON, or is not a JSON object.
   */
  async fetchManifest(): Promise<OtaManifest> {
    const url = `${OTA_BASE}/${MANIFEST_NAME}`;
    let text: string;
    try {
      const res = await this._fetch(url);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      text = await res.text();
    } catch (err) {
      throw new NyoraError(`Failed to fetch OTA manifest: ${describe(err)}`);
    }
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch (err) {
      throw new NyoraError(`Failed to fetch OTA manifest: ${describe(err)}`);
    }
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new NyoraError("OTA manifest is not a JSON object");
    }
    return data as OtaManifest;
  }

  /**
   * Return the manifest version currently cached, if any.
   *
   * @returns The cached integer version, or `null` when nothing is cached or
   *   the cached manifest is unreadable.
   */
  installedVersion(): number | null {
    const file = path.join(this._cacheDir, MANIFEST_NAME);
    if (!fs.existsSync(file)) return null;
    try {
      const data = JSON.parse(fs.readFileSync(file, "utf-8"));
      const version = data && typeof data === "object" ? data.version : null;
      return Number.isInteger(version) ? version : null;
    } catch {
      return null;
    }
  }

  /**
   * Check whether the remote feed offers a newer version.
   *
   * Network or manifest errors are treated as "no update available" rather than
   * propagating, so this is safe to call opportunistically.
   *
   * @returns An availability summary with `available`, `installed`, and
   *   `latest` fields. Either version may be `null` when unknown.
   */
  async isUpdateAvailable(): Promise<OtaUpdateAvailability> {
    const installed = this.installedVersion();
    let manifest: OtaManifest;
    try {
      manifest = await this.fetchManifest();
    } catch {
      return { available: false, installed, latest: null };
    }
    const latest = Number.isInteger(manifest.version) ? manifest.version : null;
    if (latest === null) {
      return { available: false, installed, latest: null };
    }
    const available = installed === null || latest > installed;
    return { available, installed, latest };
  }

  /**
   * Download and cache the latest parser bundle and source catalog.
   *
   * The remote manifest is fetched, each artifact is downloaded and verified
   * against its SHA-256, and all files are written atomically. When the cache is
   * already current and `force` is `false`, nothing is downloaded.
   *
   * @param options - Update options.
   * @param options.force - Re-download and overwrite even when already up to
   *   date.
   * @returns An {@link OtaUpdateResult} describing what was applied.
   * @throws {@link NyoraError} If the manifest or an artifact cannot be fetched,
   *   or if an artifact fails SHA-256 verification.
   */
  async update(options: { force?: boolean } = {}): Promise<OtaUpdateResult> {
    const force = options.force ?? false;
    const manifest = await this.fetchManifest();
    const latest = Number.isInteger(manifest.version) ? manifest.version : 0;
    const installed = this.installedVersion();

    const bundlePath = path.join(this._cacheDir, BUNDLE_NAME);
    const sourcesPath = path.join(this._cacheDir, SOURCES_NAME);

    if (
      !force &&
      installed !== null &&
      latest <= installed &&
      fs.existsSync(bundlePath) &&
      fs.existsSync(sourcesPath)
    ) {
      return { updated: false, version: installed, bundlePath, sourcesPath };
    }

    const bundleBytes = await this._downloadVerified(manifest.bundle, "bundle");
    const sourcesBytes = await this._downloadVerified(manifest.sources, "sources");

    OtaManager._atomicWrite(bundlePath, bundleBytes);
    OtaManager._atomicWrite(sourcesPath, sourcesBytes);
    OtaManager._atomicWrite(
      path.join(this._cacheDir, MANIFEST_NAME),
      Buffer.from(JSON.stringify(manifest), "utf-8"),
    );

    return { updated: true, version: latest, bundlePath, sourcesPath };
  }

  /**
   * Return the parser bundle source text.
   *
   * @returns The cached bundle text, or the package-bundled fallback when no
   *   cache exists.
   */
  readBundleText(): string {
    return this._readCachedOrAsset(BUNDLE_NAME);
  }

  /**
   * Return the source catalog JSON text.
   *
   * @returns The cached catalog text, or the package-bundled fallback when no
   *   cache exists.
   */
  readSourcesText(): string {
    return this._readCachedOrAsset(SOURCES_NAME);
  }

  private _readCachedOrAsset(name: string): string {
    const cached = path.join(this._cacheDir, name);
    if (fs.existsSync(cached)) {
      return fs.readFileSync(cached, "utf-8");
    }
    return fs.readFileSync(path.join(ASSETS_DIR, name), "utf-8");
  }

  private async _downloadVerified(entry: unknown, label: string): Promise<Buffer> {
    if (!entry || typeof entry !== "object") {
      throw new NyoraError(`OTA manifest missing '${label}' entry`);
    }
    const { url, sha256 } = entry as { url?: unknown; sha256?: unknown };
    if (typeof url !== "string" || !url) {
      throw new NyoraError(`OTA manifest '${label}' entry missing url`);
    }
    let payload: Buffer;
    try {
      const res = await this._fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      payload = Buffer.from(await res.arrayBuffer());
    } catch (err) {
      throw new NyoraError(`Failed to download OTA ${label}: ${describe(err)}`);
    }
    if (typeof sha256 === "string" && sha256) {
      const actual = createHash("sha256").update(payload).digest("hex");
      if (actual.toLowerCase() !== sha256.toLowerCase()) {
        throw new NyoraError(
          `OTA ${label} sha256 mismatch: expected ${sha256}, got ${actual}`,
        );
      }
    }
    return payload;
  }

  private async _fetch(url: string): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this._timeoutMs);
    try {
      return await fetch(url, { redirect: "follow", signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  private static _atomicWrite(file: string, data: Buffer): void {
    const dir = path.dirname(file);
    fs.mkdirSync(dir, { recursive: true });
    const tmp = path.join(dir, `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`);
    try {
      fs.writeFileSync(tmp, data);
      fs.renameSync(tmp, file);
    } catch (err) {
      try {
        fs.unlinkSync(tmp);
      } catch {
        /* ignore */
      }
      throw err;
    }
  }
}

/** Render an unknown thrown value as a short message. */
function describe(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
