/**
 * Self-contained Nyora client (no JVM helper required).
 *
 * {@link Nyora} is the default SDK entry point. It drives an embedded
 * {@link ParserRuntime} (the JavaScript parser bundle running inside jsdom) and
 * exposes two service objects:
 *
 * - {@link SourcesService} — list and look up bundled sources.
 * - {@link MangaService} — browse popular/latest, search, and fetch manga
 *   details and chapter pages.
 *
 * Over-the-air updates of the parser bundle and source catalog are managed
 * through the attached {@link OtaManager} (`client.ota`).
 *
 * @packageDocumentation
 */

import { OtaManager } from "./ota.js";
import { ParserRuntime } from "./runtime.js";
import {
  mangaDetailsFromJson,
  mangaPageFromJson,
  searchPageFromJson,
  sourceFromJson,
} from "./types.js";
import type {
  JsonDict,
  MangaDetails,
  MangaPage,
  OtaUpdateAvailability,
  OtaUpdateResult,
  SearchPage,
  Source,
} from "./types.js";

/**
 * The minimal runtime surface a {@link Nyora} client depends on.
 *
 * Declaring it as an interface lets tests inject a stub runtime without a real
 * jsdom window or any network access.
 */
export interface RuntimeLike {
  /** Return the raw bundled source catalog. */
  sources(): Record<string, unknown>[];
  /** Invoke a parser method and return its decoded result. */
  call(sourceId: string, method: string, args: Record<string, unknown>): Promise<unknown>;
  /** Rebuild the runtime from the (possibly updated) bundle. */
  reload(): void;
  /** Release runtime resources. */
  close(): void;
}

/**
 * Normalize a bundled source record into the helper REST source shape.
 *
 * @param source - A raw source entry from the parser bundle's catalog.
 * @returns A camelCase object matching the helper `/sources` contract, suitable
 *   for {@link sourceFromJson}.
 */
export function sourceToHelperShape(source: Record<string, unknown>): JsonDict {
  const id = (source.id as string) ?? "";
  const domain = source.domain as string | undefined;
  return {
    id,
    name: source.title || source.name || id,
    lang: source.locale ?? "",
    baseUrl: domain ? `https://${domain}` : "",
    engine: "JavaScript",
    contentType: "Manga",
    isInstalled: true,
    isPinned: false,
    isNsfw: Boolean(source.isNsfw),
    canUninstall: false,
  };
}

/**
 * List and look up the sources bundled with the parser runtime.
 */
export class SourcesService {
  constructor(private readonly runtime: RuntimeLike) {}

  /**
   * List every source available in the bundled catalog.
   *
   * @returns An array of {@link Source} records.
   */
  list(): Source[] {
    return this.runtime.sources().map((item) => sourceFromJson(sourceToHelperShape(item)));
  }

  /**
   * Find a bundled source by a case-insensitive id or name substring.
   *
   * @param query - Substring matched against each source's id and name.
   * @returns The first matching {@link Source}.
   * @throws {Error} If no bundled source matches `query`.
   */
  find(query: string): Source {
    const needle = query.toLowerCase();
    for (const source of this.list()) {
      if (source.id.toLowerCase().includes(needle) || source.name.toLowerCase().includes(needle)) {
        return source;
      }
    }
    throw new Error(`No bundled source matched '${query}'`);
  }
}

/**
 * Browse, search, and read manga directly through the parser runtime.
 */
export class MangaService {
  constructor(private readonly runtime: RuntimeLike) {}

  /**
   * Fetch a page of popular manga from a source.
   *
   * @param sourceId - Identifier of the source to query.
   * @param page - One-based page number to fetch.
   * @returns A {@link SearchPage} of entries.
   */
  async popular(sourceId: string, page = 1): Promise<SearchPage> {
    const data = await this.runtime.call(sourceId, "popular", { page });
    const entries = Array.isArray(data) ? data : [];
    return searchPageFromJson({ entries, hasNextPage: entries.length > 0 });
  }

  /**
   * Fetch a page of the latest updated manga from a source.
   *
   * @param sourceId - Identifier of the source to query.
   * @param page - One-based page number to fetch.
   * @returns A {@link SearchPage} of entries.
   */
  async latest(sourceId: string, page = 1): Promise<SearchPage> {
    const data = await this.runtime.call(sourceId, "latest", { page });
    const entries = Array.isArray(data) ? data : [];
    return searchPageFromJson({ entries, hasNextPage: entries.length > 0 });
  }

  /**
   * Search a source for manga matching a query.
   *
   * @param sourceId - Identifier of the source to query.
   * @param query - Free-text search query.
   * @param page - One-based page number to fetch.
   * @returns A {@link SearchPage} of matching entries.
   */
  async search(sourceId: string, query: string, page = 1): Promise<SearchPage> {
    const data = await this.runtime.call(sourceId, "search", { query, page });
    const entries = Array.isArray(data) ? data : [];
    return searchPageFromJson({ entries, hasNextPage: entries.length > 0 });
  }

  /**
   * Fetch full metadata and the chapter list for one manga.
   *
   * @param sourceId - Identifier of the source that owns the manga.
   * @param mangaUrl - The manga's source-relative or absolute URL.
   * @param options - Optional extras.
   * @param options.title - Known title passed through to the parser to help
   *   resolve the entry.
   * @returns A {@link MangaDetails} with the manga and its chapters.
   */
  async details(
    sourceId: string,
    mangaUrl: string,
    options: { title?: string } = {},
  ): Promise<MangaDetails> {
    const manga = await this.runtime.call(sourceId, "details", {
      url: mangaUrl,
      title: options.title ?? "",
    });
    const chapters =
      manga && typeof manga === "object" && !Array.isArray(manga)
        ? (manga as JsonDict).chapters
        : [];
    return mangaDetailsFromJson({ manga, chapters: Array.isArray(chapters) ? chapters : [] });
  }

  /**
   * Resolve the readable image pages of a single chapter.
   *
   * @param sourceId - Identifier of the source that owns the chapter.
   * @param chapterUrl - The chapter's source-relative or absolute URL.
   * @param options - Optional extras.
   * @param options.branch - Scanlation branch/translation to select.
   * @returns An ordered array of {@link MangaPage} objects.
   */
  async pages(
    sourceId: string,
    chapterUrl: string,
    options: { branch?: string | null } = {},
  ): Promise<MangaPage[]> {
    const data = await this.runtime.call(sourceId, "pages", {
      url: chapterUrl,
      branch: options.branch ?? null,
    });
    return (Array.isArray(data) ? data : []).map(mangaPageFromJson);
  }
}

/**
 * Default no-helper Nyora SDK client.
 *
 * Drives an embedded {@link ParserRuntime} (the JavaScript parser bundle inside
 * jsdom) entirely in-process, so it requires neither a JVM helper nor any
 * external service. The parser bundle and source catalog are kept current
 * through the attached {@link OtaManager} (`this.ota`).
 *
 * @example
 * ```ts
 * const client = new Nyora();
 * const source = client.sources.find("mangadex");
 * const page = await client.manga.popular(source.id);
 * const details = await client.manga.details(source.id, page.entries[0].url);
 * client.close();
 * ```
 */
export class Nyora {
  /** Over-the-air manager for the parser bundle and source catalog. */
  readonly ota: OtaManager;
  /** Service for listing and finding sources. */
  readonly sources: SourcesService;
  /** Service for browsing, search, and details. */
  readonly manga: MangaService;

  private readonly _runtime: RuntimeLike;

  /**
   * Initialize the client and its embedded parser runtime.
   *
   * @param options - Optional configuration.
   * @param options.ota - A pre-built {@link OtaManager} to share.
   * @param options.runtime - A pre-built runtime to use instead of creating a
   *   jsdom-backed {@link ParserRuntime}. Primarily for testing.
   */
  constructor(options: { ota?: OtaManager; runtime?: RuntimeLike } = {}) {
    this.ota = options.ota ?? new OtaManager();
    this._runtime = options.runtime ?? new ParserRuntime({ ota: this.ota });
    this.sources = new SourcesService(this._runtime);
    this.manga = new MangaService(this._runtime);
  }

  /**
   * Fetch the latest OTA parser bundle and reload the runtime.
   *
   * @param options - Update options.
   * @param options.force - Re-download and reload even if the installed version
   *   is already current.
   * @returns The {@link OtaUpdateResult} describing the applied update
   *   (`updated` is `false` when already up to date).
   */
  async update(options: { force?: boolean } = {}): Promise<OtaUpdateResult> {
    const result = await this.ota.update(options);
    this._runtime.reload();
    return result;
  }

  /**
   * Check whether a newer OTA parser bundle is available.
   *
   * @returns Availability info with `available`, `installed`, and `latest`.
   */
  async checkUpdate(): Promise<OtaUpdateAvailability> {
    return this.ota.isUpdateAvailable();
  }

  /** Close the embedded parser runtime and release its resources. */
  close(): void {
    this._runtime.close();
  }
}
