/**
 * Nyora SDK — the importable `nyora` library for Node.js.
 *
 * Nyora is a manga sources SDK. The default client ({@link Nyora}) is a thin
 * client over the Nyora cloud helper (`https://api.hasanraza.tech`, the
 * kotatsu-parsers engine, ~960 sources): it runs no parsers in-process — HTTP is
 * handled by Node's native `fetch`. {@link NyoraSync} adds account + library sync
 * against the Nyora cloud (`https://stream.hasanraza.tech`).
 *
 * The importable library and the separately shipped `nyora-cli` tool (which
 * launches the terminal UI) are distinct: this module is the SDK surface.
 *
 * @example
 * ```ts
 * import { Nyora } from "nyora-sdk";
 *
 * const client = new Nyora();
 * const source = await client.sources.find("mangadex");
 * const page = await client.manga.popular(source.id);
 * const first = page.entries[0];
 * const details = await client.manga.details(source.id, first.url, { title: first.title });
 * ```
 *
 * @packageDocumentation
 */

export { Nyora, SourcesService, MangaService } from "./client.js";

export { CloudClient, CLOUD_BASE_URL } from "./cloud.js";
export type { CloudOptions } from "./cloud.js";

export { NyoraSync, NotSignedInError as SyncNotSignedInError, SYNC_BASE_URL } from "./sync.js";
export type { SyncOptions } from "./sync.js";

export {
  defaultPortFile,
  readBaseUrlFromPortFile,
  BASE_URL_ENV,
  HELPER_PORT_FILE_ENV,
} from "./config.js";

export {
  NyoraError,
  HelperNotFoundError,
  NyoraHTTPError,
} from "./errors.js";

export {
  chapterReadingDelta,
  readingOrder,
  adjacentChapter,
  nextChapter,
  previousChapter,
} from "./ordering.js";

export {
  mangaPageFromJson,
  mangaChapterFromJson,
  mangaFromJson,
  sourceFromJson,
  searchPageFromJson,
  mangaDetailsFromJson,
} from "./types.js";
export type {
  JsonDict,
  MangaPage,
  MangaChapter,
  Manga,
  Source,
  SearchPage,
  MangaDetails,
} from "./types.js";

import { Nyora } from "./client.js";
/** The default export is the {@link Nyora} client class. */
export default Nyora;
