/**
 * Typed data models for the Nyora SDK.
 *
 * These mirror the Python `nyora.models` dataclasses, but use idiomatic JS
 * camelCase field names. Each model exposes a tolerant `fromJson` factory that
 * accepts the raw camelCase payloads emitted by the parser runtime (or the
 * helper REST API) and coerces field types defensively, so missing or malformed
 * fields fall back to sensible defaults rather than throwing.
 *
 * @packageDocumentation
 */

/** Arbitrary JSON object. */
export type JsonDict = Record<string, unknown>;

/** Return `value` if it is an array, else an empty array. */
function asList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** Return `value` if it is a plain object, else an empty object. */
function asDict(value: unknown): JsonDict {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonDict)
    : {};
}

/** Coerce `value` to a number, returning `fallback` on failure. */
function asNumber(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Coerce `value` to an integer, returning `fallback` on failure. */
function asInt(value: unknown, fallback = 0): number {
  const n = asNumber(value, fallback);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

/** Coerce `value` to a string, returning `fallback` when nullish. */
function asString(value: unknown, fallback = ""): string {
  if (value === null || value === undefined) return fallback;
  return String(value);
}

/** Coerce `value` to a boolean. */
function asBool(value: unknown, fallback = false): boolean {
  if (value === null || value === undefined) return fallback;
  return Boolean(value);
}

/**
 * A single readable image page of a chapter.
 */
export interface MangaPage {
  /** The image URL. */
  url: string;
  /** Request headers required to fetch the image (e.g. `Referer`). */
  headers: Record<string, string>;
}

/**
 * Build a {@link MangaPage} from a raw payload.
 *
 * @param data - A page object, or a bare string treated as the URL.
 * @returns The parsed page.
 */
export function mangaPageFromJson(data: unknown): MangaPage {
  if (typeof data === "string") {
    return { url: data, headers: {} };
  }
  const obj = asDict(data);
  const rawHeaders = asDict(obj.headers);
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(rawHeaders)) headers[String(k)] = String(v);
  return { url: asString(obj.url), headers };
}

/**
 * A chapter belonging to a manga.
 */
export interface MangaChapter {
  /** Stable chapter identifier. */
  id: string;
  /** Display title. */
  title: string;
  /** Chapter number (may be fractional). */
  number: number;
  /** Volume number, or `0` if unknown. */
  volume: number;
  /** Source-relative or absolute chapter URL. */
  url: string;
  /** Scanlation group, if known. */
  scanlator: string | null;
  /** Upload timestamp in epoch milliseconds. */
  uploadDate: number;
  /** Scanlation branch/translation name, if any. */
  branch: string | null;
  /** Resolved pages, when already loaded. */
  pages: MangaPage[];
  /** Position within the chapter list. */
  index: number;
}

/**
 * Build a {@link MangaChapter} from a raw payload.
 *
 * @param data - A chapter object from the parser or helper.
 * @returns The parsed chapter.
 */
export function mangaChapterFromJson(data: unknown): MangaChapter {
  const obj = asDict(data);
  return {
    id: asString(obj.id),
    title: asString(obj.title),
    number: asNumber(obj.number),
    volume: asInt(obj.volume),
    url: asString(obj.url),
    scanlator: obj.scanlator == null ? null : asString(obj.scanlator),
    uploadDate: asInt(obj.uploadDate),
    branch: obj.branch == null ? null : asString(obj.branch),
    pages: asList(obj.pages).map(mangaPageFromJson),
    index: asInt(obj.index),
  };
}

/**
 * A manga entry as returned in listings and details.
 */
export interface Manga {
  /** Stable manga identifier. */
  id: string;
  /** Primary title. */
  title: string;
  /** Alternative titles. */
  altTitles: string[];
  /** Source-relative or absolute manga URL. */
  url: string;
  /** Public web URL for the manga, if distinct. */
  publicUrl: string;
  /** Normalized rating, or `-1` when unknown. */
  rating: number;
  /** Whether the entry is flagged adult/NSFW. */
  isNsfw: boolean;
  /** Source-provided content rating, if any. */
  contentRating: string | null;
  /** Cover thumbnail URL. */
  coverUrl: string;
  /** High-resolution cover URL, if available. */
  largeCoverUrl: string | null;
  /** Publication state (e.g. ongoing/finished), if known. */
  state: string | null;
  /** Author names. */
  authors: string[];
  /** Raw source metadata as an object. */
  source: JsonDict;
  /** Identifier of the owning source. */
  sourceId: string;
  /** Synopsis text. */
  description: string;
  /** Genre/tag objects. */
  tags: JsonDict[];
  /** Chapters, when already loaded. */
  chapters: MangaChapter[];
  /** Unread chapter count, for library entries. */
  unread: number;
  /** Read progress fraction, for library entries. */
  progress: number;
}

/**
 * Build a {@link Manga} from a raw payload.
 *
 * @param data - A manga object from the parser or helper.
 * @returns The parsed manga.
 */
export function mangaFromJson(data: unknown): Manga {
  const obj = asDict(data);
  return {
    id: asString(obj.id),
    title: asString(obj.title),
    altTitles: asList(obj.altTitles).map((x) => asString(x)),
    url: asString(obj.url),
    publicUrl: asString(obj.publicUrl),
    rating: asNumber(obj.rating, -1),
    isNsfw: asBool(obj.isNsfw),
    contentRating: obj.contentRating == null ? null : asString(obj.contentRating),
    coverUrl: asString(obj.coverUrl),
    largeCoverUrl: obj.largeCoverUrl == null ? null : asString(obj.largeCoverUrl),
    state: obj.state == null ? null : asString(obj.state),
    authors: asList(obj.authors).map((x) => asString(x)),
    source: asDict(obj.source),
    sourceId: asString(obj.sourceId),
    description: asString(obj.description),
    tags: asList(obj.tags).map((x) => asDict(x)),
    chapters: asList(obj.chapters).map(mangaChapterFromJson),
    unread: asInt(obj.unread),
    progress: asNumber(obj.progress),
  };
}

/**
 * A content source (site) the SDK can read from.
 */
export interface Source {
  /** Stable source identifier. */
  id: string;
  /** Human-readable source name. */
  name: string;
  /** Primary content language/locale code. */
  lang: string;
  /** The source's base site URL. */
  baseUrl: string;
  /** Parser engine (e.g. `"JavaScript"`). */
  engine: string;
  /** Content type (e.g. `"Manga"`). */
  contentType: string;
  /** Whether the source is installed/available. */
  isInstalled: boolean;
  /** Whether the user pinned the source. */
  isPinned: boolean;
  /** Whether the source is flagged adult/NSFW. */
  isNsfw: boolean;
  /** Whether the source is deprecated. */
  isObsolete: boolean;
  /** Source icon URL. */
  iconUrl: string;
  /** Source/parser version string. */
  version: string;
  /** Free-form notes. */
  notes: string;
  /** Whether the source may be uninstalled. */
  canUninstall: boolean;
}

/**
 * Build a {@link Source} from a raw payload.
 *
 * Accepts both `name`/`title`, `lang`/`locale`, and `baseUrl`/`site` aliases.
 *
 * @param data - A source object from the parser or helper.
 * @returns The parsed source.
 */
export function sourceFromJson(data: unknown): Source {
  const obj = asDict(data);
  return {
    id: asString(obj.id),
    name: asString(obj.name || obj.title || ""),
    lang: asString(obj.lang || obj.locale || ""),
    baseUrl: asString(obj.baseUrl || obj.site || ""),
    engine: asString(obj.engine),
    contentType: asString(obj.contentType),
    isInstalled: asBool(obj.isInstalled),
    isPinned: asBool(obj.isPinned),
    isNsfw: asBool(obj.isNsfw),
    isObsolete: asBool(obj.isObsolete),
    iconUrl: asString(obj.iconUrl),
    version: asString(obj.version),
    notes: asString(obj.notes),
    canUninstall: asBool(obj.canUninstall, true),
  };
}

/**
 * One page of manga results from browse or search.
 */
export interface SearchPage {
  /** The manga on this page. */
  entries: Manga[];
  /** Whether a further page is likely available. */
  hasNextPage: boolean;
}

/**
 * Build a {@link SearchPage} from a raw payload.
 *
 * @param data - A page object with `entries` and `hasNextPage`.
 * @returns The parsed page.
 */
export function searchPageFromJson(data: unknown): SearchPage {
  const obj = asDict(data);
  return {
    entries: asList(obj.entries).map(mangaFromJson),
    hasNextPage: asBool(obj.hasNextPage),
  };
}

/**
 * Full metadata for one manga together with its chapter list.
 */
export interface MangaDetails {
  /** The manga metadata. */
  manga: Manga;
  /** The manga's chapters. */
  chapters: MangaChapter[];
}

/**
 * Build a {@link MangaDetails} from a raw payload.
 *
 * @param data - An object with `manga` and `chapters`.
 * @returns The parsed details.
 */
export function mangaDetailsFromJson(data: unknown): MangaDetails {
  const obj = asDict(data);
  return {
    manga: mangaFromJson(obj.manga),
    chapters: asList(obj.chapters).map(mangaChapterFromJson),
  };
}

/**
 * The OTA manifest published by the parser feed.
 *
 * @remarks
 * Mirrors `GET /manifest.json` on the OTA feed: a `version` plus one entry per
 * downloadable artifact, each carrying its URL, expected SHA-256, and byte size.
 */
export interface OtaManifest {
  /** Monotonic feed version. */
  version: number;
  /** The parser bundle artifact descriptor. */
  bundle?: OtaArtifact;
  /** The source catalog artifact descriptor. */
  sources?: OtaArtifact;
  /** Any additional manifest fields are preserved. */
  [key: string]: unknown;
}

/**
 * A single downloadable OTA artifact described in the manifest.
 */
export interface OtaArtifact {
  /** Absolute URL to download the artifact from. */
  url: string;
  /** Expected lowercase hex SHA-256 of the artifact bytes. */
  sha256?: string;
  /** Artifact size in bytes, if advertised. */
  bytes?: number;
}

/**
 * Outcome of an OTA update attempt.
 */
export interface OtaUpdateResult {
  /**
   * `true` if new artifacts were downloaded and written; `false` if the cache
   * was already current.
   */
  updated: boolean;
  /** The manifest version now installed in the cache. */
  version: number;
  /** Filesystem path to the cached parser bundle. */
  bundlePath: string;
  /** Filesystem path to the cached source catalog. */
  sourcesPath: string;
}

/**
 * Result of an availability check against the remote feed.
 *
 * @remarks
 * Either version may be `null` when unknown (e.g. nothing installed yet, or the
 * manifest could not be reached).
 */
export interface OtaUpdateAvailability {
  /** Whether the feed offers a newer version than what is installed. */
  available: boolean;
  /** The installed version, or `null` when nothing is cached. */
  installed: number | null;
  /** The latest version advertised by the feed, or `null` when unknown. */
  latest: number | null;
}
