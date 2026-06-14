import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { OtaManager } from "../src/ota.js";
import { NyoraError } from "../src/errors.js";

/** Build a mock Response for global fetch with the given body + status. */
function mockResponse(body: string | Buffer, init: { status?: number; url?: string } = {}): Response {
  const status = init.status ?? 200;
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(body, "utf-8");
  return {
    ok: status >= 200 && status < 300,
    status,
    url: init.url ?? "https://example.test/",
    text: async () => buf.toString("utf-8"),
    arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
  } as unknown as Response;
}

function sha256(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

describe("OtaManager", () => {
  let cacheDir: string;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "nyora-ota-"));
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    fs.rmSync(cacheDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("falls back to bundled assets when nothing is cached", () => {
    const ota = new OtaManager({ cacheDir });
    const bundle = ota.readBundleText();
    const sources = ota.readSourcesText();
    expect(bundle).toContain("NyoraParsers");
    const parsed = JSON.parse(sources);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBeGreaterThan(100);
  });

  it("installedVersion is null on an empty cache", () => {
    const ota = new OtaManager({ cacheDir });
    expect(ota.installedVersion()).toBeNull();
  });

  it("fetchManifest parses a JSON object", async () => {
    globalThis.fetch = vi.fn(async () =>
      mockResponse(JSON.stringify({ version: 5, bundle: {}, sources: {} })),
    ) as unknown as typeof fetch;
    const ota = new OtaManager({ cacheDir });
    const manifest = await ota.fetchManifest();
    expect(manifest.version).toBe(5);
  });

  it("fetchManifest throws NyoraError on non-object JSON", async () => {
    globalThis.fetch = vi.fn(async () => mockResponse("[1,2,3]")) as unknown as typeof fetch;
    const ota = new OtaManager({ cacheDir });
    await expect(ota.fetchManifest()).rejects.toBeInstanceOf(NyoraError);
  });

  it("update verifies sha256, writes atomically, and caches the version", async () => {
    const bundleBody = "globalThis.NyoraParsers = {};";
    const sourcesBody = "[]";
    const manifest = {
      version: 7,
      bundle: {
        url: "https://feed.test/parsers.bundle.js",
        sha256: sha256(bundleBody),
      },
      sources: {
        url: "https://feed.test/sources.json",
        sha256: sha256(sourcesBody),
      },
    };
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const u = String(input);
      if (u.endsWith("manifest.json")) return mockResponse(JSON.stringify(manifest));
      if (u.endsWith("parsers.bundle.js")) return mockResponse(bundleBody);
      if (u.endsWith("sources.json")) return mockResponse(sourcesBody);
      return mockResponse("", { status: 404 });
    }) as unknown as typeof fetch;

    const ota = new OtaManager({ cacheDir });
    const result = await ota.update();
    expect(result.updated).toBe(true);
    expect(result.version).toBe(7);
    expect(fs.existsSync(result.bundlePath)).toBe(true);
    expect(fs.existsSync(result.sourcesPath)).toBe(true);
    expect(ota.installedVersion()).toBe(7);
    // Cached reads now return the downloaded artifacts, not the asset fallback.
    expect(ota.readBundleText()).toBe(bundleBody);

    // Second update with same version is a no-op.
    const again = await ota.update();
    expect(again.updated).toBe(false);
    expect(again.version).toBe(7);
  });

  it("update throws NyoraError on a sha256 mismatch", async () => {
    const manifest = {
      version: 3,
      bundle: { url: "https://feed.test/parsers.bundle.js", sha256: "deadbeef" },
      sources: { url: "https://feed.test/sources.json", sha256: "deadbeef" },
    };
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const u = String(input);
      if (u.endsWith("manifest.json")) return mockResponse(JSON.stringify(manifest));
      return mockResponse("anything");
    }) as unknown as typeof fetch;

    const ota = new OtaManager({ cacheDir });
    await expect(ota.update()).rejects.toBeInstanceOf(NyoraError);
  });

  it("isUpdateAvailable treats network errors as no update", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    const ota = new OtaManager({ cacheDir });
    const avail = await ota.isUpdateAvailable();
    expect(avail.available).toBe(false);
    expect(avail.latest).toBeNull();
  });

  it.skip("network: fetches the real manifest from the OTA feed", async () => {
    const ota = new OtaManager({ cacheDir });
    const manifest = await ota.fetchManifest();
    expect(typeof manifest.version).toBe("number");
  });
});
