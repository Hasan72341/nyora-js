import { afterEach, describe, expect, it } from "vitest";

import { NyoraServer } from "../src/server.js";
import type { CallArgs } from "../src/runtime.js";

/**
 * A fake runtime that records calls and returns canned camelCase parser
 * payloads, so {@link NyoraServer} can be exercised offline with no jsdom and no
 * network.
 */
class FakeRuntime {
  calls: Array<{ sourceId: string; method: string; args: CallArgs }> = [];
  closed = false;

  sources(): Record<string, unknown>[] {
    return [
      { id: "MANGADEX", title: "MangaDex", locale: "en", domain: "mangadex.org", isNsfw: false },
      { id: "WEEBCENTRAL", title: "Weeb Central", locale: "en", domain: "weebcentral.com" },
    ];
  }

  async call(sourceId: string, method: string, args: CallArgs): Promise<unknown> {
    this.calls.push({ sourceId, method, args });
    if (method === "popular" || method === "latest" || method === "search") {
      return [
        { id: "m1", title: "First", url: "/manga/1", coverUrl: "https://x/1.jpg" },
        { id: "m2", title: "Second", url: "/manga/2" },
      ];
    }
    if (method === "details") {
      return {
        id: "m1",
        title: "First",
        url: "/manga/1",
        chapters: [{ id: "c1", title: "Ch 1", number: 1, url: "/ch/1" }],
      };
    }
    if (method === "pages") {
      return [{ url: "https://img/1.jpg" }, "https://img/2.jpg"];
    }
    return null;
  }

  close(): void {
    this.closed = true;
  }
}

describe("NyoraServer (stubbed runtime, offline)", () => {
  let server: NyoraServer | null = null;

  afterEach(async () => {
    if (server) {
      await server.stop();
      server = null;
    }
  });

  /** Start a server on an ephemeral port with the fake runtime injected. */
  async function startServer(): Promise<{
    base: string;
    runtime: FakeRuntime;
    srv: NyoraServer;
  }> {
    const runtime = new FakeRuntime();
    const srv = new NyoraServer({ port: 0, runtime, writePortFile: false });
    server = srv;
    const base = await srv.start();
    return { base, runtime, srv };
  }

  it("baseUrl throws before start", () => {
    const srv = new NyoraServer({ runtime: new FakeRuntime(), writePortFile: false });
    expect(() => srv.baseUrl).toThrow();
  });

  it("GET /health returns the JS engine marker", async () => {
    const { base } = await startServer();
    const res = await fetch(`${base}/health`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    const body = await res.json();
    expect(body).toEqual({ ok: true, engine: "node-jsdom" });
  });

  it("GET /sources returns helper-shaped sources", async () => {
    const { base } = await startServer();
    const res = await fetch(`${base}/sources`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { sources: Record<string, unknown>[] };
    expect(body.sources).toHaveLength(2);
    const md = body.sources[0];
    expect(md).toMatchObject({
      id: "MANGADEX",
      name: "MangaDex",
      lang: "en",
      baseUrl: "https://mangadex.org",
      engine: "JavaScript",
      contentType: "Manga",
      isInstalled: true,
      isPinned: false,
      isNsfw: false,
      canUninstall: false,
    });
  });

  it("GET /sources/search returns {entries,hasNextPage} and forwards the query", async () => {
    const { base, runtime } = await startServer();
    const res = await fetch(`${base}/sources/search?id=MANGADEX&q=naruto&page=3`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { entries: unknown[]; hasNextPage: boolean };
    expect(body.entries).toHaveLength(2);
    expect(body.hasNextPage).toBe(true);
    expect(runtime.calls[0]).toEqual({
      sourceId: "MANGADEX",
      method: "search",
      args: { page: 3, query: "naruto" },
    });
  });

  it("GET /sources/popular forwards the page", async () => {
    const { base, runtime } = await startServer();
    const res = await fetch(`${base}/sources/popular?id=MANGADEX&page=2`);
    expect(res.status).toBe(200);
    expect(runtime.calls[0]).toMatchObject({ method: "popular", args: { page: 2 } });
  });

  it("GET /manga/details returns {manga,chapters}", async () => {
    const { base } = await startServer();
    const res = await fetch(`${base}/manga/details?id=MANGADEX&url=/manga/1&title=First`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      manga: { title: string };
      chapters: unknown[];
    };
    expect(body.manga.title).toBe("First");
    expect(body.chapters).toHaveLength(1);
  });

  it("GET /manga/pages returns {pages}", async () => {
    const { base } = await startServer();
    const res = await fetch(`${base}/manga/pages?id=MANGADEX&url=/ch/1`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { pages: unknown[] };
    expect(body.pages).toHaveLength(2);
  });

  it("returns 400 JSON when a required query parameter is missing", async () => {
    const { base } = await startServer();
    const res = await fetch(`${base}/sources/popular`);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("id");
  });

  it("returns 400 JSON when page is not an integer", async () => {
    const { base } = await startServer();
    const res = await fetch(`${base}/sources/popular?id=MANGADEX&page=abc`);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("integer");
  });

  it("returns 404 JSON for an unknown path", async () => {
    const { base } = await startServer();
    const res = await fetch(`${base}/nope`);
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("Not found");
  });

  it("stop() closes an owned-by-injection runtime only when it owns it", async () => {
    const { runtime, srv } = await startServer();
    await srv.stop();
    server = null;
    // The runtime was injected, so the server does NOT own it and must not close it.
    expect(runtime.closed).toBe(false);
  });
});
