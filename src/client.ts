/**
 * Cloud Nyora SDK client.
 *
 * {@link Nyora} is the default SDK entry point. It is a thin client over the
 * Nyora cloud helper (`https://api.hasanraza.tech`) — it does **not** run any
 * parsers in-process. It exposes two service objects:
 *
 * - {@link SourcesService} — list and look up cloud sources.
 * - {@link MangaService} — browse popular/latest, search, and fetch manga
 *   details and chapter pages.
 *
 * @packageDocumentation
 */

import { BLOCKED_SOURCE_IDS } from "./blocked-sources.js";
import { CloudClient, type CloudOptions } from "./cloud.js";
import {
  mangaDetailsFromJson,
  mangaPageFromJson,
  searchPageFromJson,
  sourceFromJson,
} from "./types.js";
import type { JsonDict, MangaDetails, MangaPage, SearchPage, Source } from "./types.js";

/**
 * The helper rewrites cover/page image URLs to a `127.0.0.1/image?u=…` proxy.
 * Swap that local base for the configured public server so the URLs are usable.
 */
function rewriteImage(raw: unknown, baseUrl: string): unknown {
  if (typeof raw !== "string") return raw;
  const idx = raw.indexOf("/image?u=");
  return idx >= 0 ? baseUrl.replace(/\/+$/, "") + raw.slice(idx) : raw;
}

function fixEntry(entry: JsonDict, baseUrl: string): JsonDict {
  if (entry && typeof entry === "object" && "coverUrl" in entry) {
    return { ...entry, coverUrl: rewriteImage(entry.coverUrl, baseUrl) };
  }
  return entry;
}

/** List and look up the sources available on the Nyora cloud helper. */
export class SourcesService {
  constructor(private readonly cloud: CloudClient) {}

  /** List the sources currently loaded on the helper. */
  async list(): Promise<Source[]> {
    const data = await this.cloud.get<{ sources?: JsonDict[]; entries?: JsonDict[] }>("/sources");
    return (data.sources ?? data.entries ?? [])
      .map((item) => sourceFromJson(item))
      .filter((s) => !BLOCKED_SOURCE_IDS.has(s.id));
  }

  /** List every source in the catalog (loaded or not). */
  async catalog(): Promise<Source[]> {
    const data = await this.cloud.get<{ entries?: JsonDict[] }>("/sources/catalog");
    return (data.entries ?? [])
      .map((item) => sourceFromJson(item))
      .filter((s) => !BLOCKED_SOURCE_IDS.has(s.id));
  }

  /** Find a source by case-insensitive id or name substring. */
  async find(query: string): Promise<Source> {
    const needle = query.toLowerCase();
    for (const source of await this.catalog()) {
      if (source.id.toLowerCase().includes(needle) || source.name.toLowerCase().includes(needle)) {
        return source;
      }
    }
    throw new Error(`No source matched '${query}'`);
  }
}

/** Browse, search, and read manga through the Nyora cloud helper. */
export class MangaService {
  constructor(private readonly cloud: CloudClient) {}

  private get base(): string {
    return this.cloud.baseUrl;
  }

  /** Fetch a page of popular manga from a source. */
  async popular(sourceId: string, page = 1): Promise<SearchPage> {
    const data = await this.cloud.getEnsuringInstalled<{ entries?: JsonDict[]; hasNextPage?: boolean }>(
      "/sources/popular",
      sourceId,
      { page },
    );
    return searchPageFromJson({
      entries: (data.entries ?? []).map((e) => fixEntry(e, this.base)),
      hasNextPage: Boolean(data.hasNextPage),
    });
  }

  /** Fetch a page of the latest updated manga from a source. */
  async latest(sourceId: string, page = 1): Promise<SearchPage> {
    const data = await this.cloud.getEnsuringInstalled<{ entries?: JsonDict[]; hasNextPage?: boolean }>(
      "/sources/latest",
      sourceId,
      { page },
    );
    return searchPageFromJson({
      entries: (data.entries ?? []).map((e) => fixEntry(e, this.base)),
      hasNextPage: Boolean(data.hasNextPage),
    });
  }

  /** Search a source. */
  async search(sourceId: string, query: string, page = 1): Promise<SearchPage> {
    if (!query) return searchPageFromJson({ entries: [], hasNextPage: false });
    const data = await this.cloud.getEnsuringInstalled<{ entries?: JsonDict[]; hasNextPage?: boolean }>(
      "/sources/search",
      sourceId,
      { q: query, page },
    );
    return searchPageFromJson({
      entries: (data.entries ?? []).map((e) => fixEntry(e, this.base)),
      hasNextPage: Boolean(data.hasNextPage),
    });
  }

  /** Fetch full metadata and the chapter list for one manga. */
  async details(
    sourceId: string,
    mangaUrl: string,
    options: { title?: string } = {},
  ): Promise<MangaDetails> {
    const params: Record<string, string> = { url: mangaUrl };
    if (options.title) params.title = options.title;
    const data = await this.cloud.getEnsuringInstalled<{ manga: JsonDict; chapters?: JsonDict[] }>(
      "/manga/details",
      sourceId,
      params,
    );
    return mangaDetailsFromJson({
      manga: fixEntry(data.manga, this.base),
      chapters: Array.isArray(data.chapters) ? data.chapters : [],
    });
  }

  /** Resolve the readable image pages of a single chapter. */
  async pages(
    sourceId: string,
    chapterUrl: string,
    options: { branch?: string | null } = {},
  ): Promise<MangaPage[]> {
    const params: Record<string, string> = { url: chapterUrl };
    if (options.branch) params.branch = options.branch;
    const data = await this.cloud.getEnsuringInstalled<{ pages?: JsonDict[] }>(
      "/manga/pages",
      sourceId,
      params,
    );
    return (data.pages ?? []).map((p) =>
      mangaPageFromJson({ ...p, url: rewriteImage(p.url, this.base) }),
    );
  }
}

/**
 * Default Nyora SDK client — a thin cloud client.
 *
 * @example
 * ```ts
 * const client = new Nyora();
 * const source = await client.sources.find("mangadex");
 * const page = await client.manga.popular(source.id);
 * const details = await client.manga.details(source.id, page.entries[0].url);
 * ```
 */
export class Nyora {
  /** The underlying cloud transport. */
  readonly cloud: CloudClient;
  /** Service for listing and finding sources. */
  readonly sources: SourcesService;
  /** Service for browsing, search, and details. */
  readonly manga: MangaService;

  constructor(options: CloudOptions = {}) {
    this.cloud = new CloudClient(options);
    this.sources = new SourcesService(this.cloud);
    this.manga = new MangaService(this.cloud);
  }

  /** No-op: kept for API compatibility (fetch needs no teardown). */
  close(): void {
    /* nothing to release */
  }
}
