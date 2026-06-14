import { describe, expect, it, vi } from "vitest";

import { Nyora } from "../src/client.js";
import type { RuntimeLike } from "../src/client.js";

/**
 * A fake runtime that records calls and returns canned camelCase parser
 * payloads, so the client surface can be exercised offline with no jsdom and no
 * network.
 */
class FakeRuntime implements RuntimeLike {
  calls: Array<{ sourceId: string; method: string; args: Record<string, unknown> }> = [];
  closed = false;
  reloaded = false;

  sources(): Record<string, unknown>[] {
    return [
      { id: "MANGADEX", title: "MangaDex", locale: "en", domain: "mangadex.org", isNsfw: false },
      { id: "WEEBCENTRAL", title: "Weeb Central", locale: "en", domain: "weebcentral.com" },
    ];
  }

  async call(
    sourceId: string,
    method: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
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
        description: "desc",
        chapters: [{ id: "c1", title: "Ch 1", number: 1, url: "/ch/1" }],
      };
    }
    if (method === "pages") {
      return [
        { url: "https://img/1.jpg", headers: { Referer: "https://x/" } },
        "https://img/2.jpg",
      ];
    }
    return null;
  }

  reload(): void {
    this.reloaded = true;
  }

  close(): void {
    this.closed = true;
  }
}

describe("Nyora client (stubbed runtime)", () => {
  function makeClient() {
    const runtime = new FakeRuntime();
    const client = new Nyora({ runtime });
    return { client, runtime };
  }

  it("sources.list maps to the helper Source shape", () => {
    const { client } = makeClient();
    const sources = client.sources.list();
    expect(sources).toHaveLength(2);
    const md = sources[0];
    expect(md.id).toBe("MANGADEX");
    expect(md.name).toBe("MangaDex");
    expect(md.lang).toBe("en");
    expect(md.baseUrl).toBe("https://mangadex.org");
    expect(md.engine).toBe("JavaScript");
    expect(md.contentType).toBe("Manga");
    expect(md.isInstalled).toBe(true);
    expect(md.canUninstall).toBe(false);
  });

  it("sources.find matches by id or name, case-insensitively", () => {
    const { client } = makeClient();
    expect(client.sources.find("mangadex").id).toBe("MANGADEX");
    expect(client.sources.find("weeb central").id).toBe("WEEBCENTRAL");
    expect(() => client.sources.find("nope")).toThrow();
  });

  it("manga.popular returns a SearchPage of parsed entries", async () => {
    const { client, runtime } = makeClient();
    const page = await client.manga.popular("MANGADEX", 2);
    expect(page.entries).toHaveLength(2);
    expect(page.entries[0].title).toBe("First");
    expect(page.hasNextPage).toBe(true);
    expect(runtime.calls[0]).toEqual({
      sourceId: "MANGADEX",
      method: "popular",
      args: { page: 2 },
    });
  });

  it("manga.latest passes the page through", async () => {
    const { client, runtime } = makeClient();
    await client.manga.latest("MANGADEX");
    expect(runtime.calls[0]).toMatchObject({ method: "latest", args: { page: 1 } });
  });

  it("manga.search forwards the query", async () => {
    const { client, runtime } = makeClient();
    const page = await client.manga.search("MANGADEX", "naruto", 3);
    expect(page.entries).toHaveLength(2);
    expect(runtime.calls[0]).toEqual({
      sourceId: "MANGADEX",
      method: "search",
      args: { query: "naruto", page: 3 },
    });
  });

  it("manga.details returns MangaDetails with chapters", async () => {
    const { client, runtime } = makeClient();
    const details = await client.manga.details("MANGADEX", "/manga/1", { title: "First" });
    expect(details.manga.title).toBe("First");
    expect(details.chapters).toHaveLength(1);
    expect(details.chapters[0].number).toBe(1);
    expect(runtime.calls[0].args).toEqual({ url: "/manga/1", title: "First" });
  });

  it("manga.pages parses object and bare-string pages", async () => {
    const { client, runtime } = makeClient();
    const pages = await client.manga.pages("MANGADEX", "/ch/1", { branch: "en" });
    expect(pages).toHaveLength(2);
    expect(pages[0].url).toBe("https://img/1.jpg");
    expect(pages[0].headers.Referer).toBe("https://x/");
    expect(pages[1].url).toBe("https://img/2.jpg");
    expect(runtime.calls[0].args).toEqual({ url: "/ch/1", branch: "en" });
  });

  it("close() closes the runtime", () => {
    const { client, runtime } = makeClient();
    client.close();
    expect(runtime.closed).toBe(true);
  });

  it("update() applies OTA then reloads the runtime", async () => {
    const runtime = new FakeRuntime();
    const fakeOta = {
      update: vi.fn(async () => ({
        updated: true,
        version: 9,
        bundlePath: "/tmp/b",
        sourcesPath: "/tmp/s",
      })),
      isUpdateAvailable: vi.fn(async () => ({ available: true, installed: 8, latest: 9 })),
    };
    const client = new Nyora({ runtime, ota: fakeOta as never });
    const result = await client.update({ force: true });
    expect(result.version).toBe(9);
    expect(fakeOta.update).toHaveBeenCalledWith({ force: true });
    expect(runtime.reloaded).toBe(true);
    const avail = await client.checkUpdate();
    expect(avail.available).toBe(true);
  });
});
