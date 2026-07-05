import { describe, expect, it } from "vitest";

import { MangaService, SourcesService } from "../src/client.js";
import type { CloudClient } from "../src/cloud.js";

/** A fake CloudClient that answers by request path. */
function fakeCloud(responses: Record<string, unknown>): CloudClient {
  const answer = async (path: string): Promise<unknown> => responses[path];
  return {
    baseUrl: "https://api.test",
    get: (path: string) => answer(path),
    getEnsuringInstalled: (path: string) => answer(path),
    install: async () => {},
  } as unknown as CloudClient;
}

describe("SourcesService", () => {
  it("lists sources from the cloud catalog", async () => {
    const svc = new SourcesService(
      fakeCloud({ "/sources": { sources: [{ id: "parser:MANGADEX", name: "MangaDex", lang: "en" }] } }),
    );
    const list = await svc.list();
    expect(list[0].id).toBe("parser:MANGADEX");
    expect(list[0].name).toBe("MangaDex");
  });

  it("finds a source by substring in the catalog", async () => {
    const svc = new SourcesService(
      fakeCloud({ "/sources/catalog": { entries: [{ id: "parser:MANGADEX", name: "MangaDex", lang: "en" }] } }),
    );
    const hit = await svc.find("mangadex");
    expect(hit.id).toBe("parser:MANGADEX");
    await expect(svc.find("nope")).rejects.toThrow(/No source matched/);
  });
});

describe("MangaService", () => {
  it("maps popular results and rewrites the cover image host", async () => {
    const svc = new MangaService(
      fakeCloud({
        "/sources/popular": {
          entries: [{ id: "1", title: "T", url: "/m/1", coverUrl: "http://127.0.0.1/image?u=abc" }],
          hasNextPage: true,
        },
      }),
    );
    const page = await svc.popular("parser:MANGADEX");
    expect(page.hasNextPage).toBe(true);
    expect(page.entries[0].title).toBe("T");
    expect(page.entries[0].coverUrl).toBe("https://api.test/image?u=abc");
  });

  it("rewrites page image URLs", async () => {
    const svc = new MangaService(
      fakeCloud({ "/manga/pages": { pages: [{ url: "http://127.0.0.1/image?u=p1" }] } }),
    );
    const pages = await svc.pages("parser:MANGADEX", "/ch/1");
    expect(pages[0].url).toBe("https://api.test/image?u=p1");
  });

  it("returns an empty page for a blank search", async () => {
    const svc = new MangaService(fakeCloud({}));
    const page = await svc.search("parser:MANGADEX", "");
    expect(page.entries).toEqual([]);
    expect(page.hasNextPage).toBe(false);
  });
});
