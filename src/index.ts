/**
 * Nyora SDK — the importable `nyora` library for Node.js.
 *
 * Nyora is a self-contained manga sources SDK. The default client
 * ({@link Nyora}) embeds the JavaScript parser bundle inside a jsdom window via
 * {@link ParserRuntime}, so it needs **no** JVM helper: HTTP is handled by
 * Node's native `fetch` and HTML parsing by jsdom. The parser bundle and source
 * catalog are kept current through {@link OtaManager} (over-the-air updates).
 *
 * The importable library and the separately shipped `nyora-cli` tool (which
 * launches the terminal UI) are distinct: this module is the SDK surface.
 *
 * @example
 * ```ts
 * import { Nyora } from "nyora";
 *
 * const client = new Nyora();
 * const source = client.sources.find("mangadex");
 * const page = await client.manga.popular(source.id);
 * const first = page.entries[0];
 * const details = await client.manga.details(source.id, first.url, { title: first.title });
 * client.close();
 * ```
 *
 * @packageDocumentation
 */

export { Nyora, SourcesService, MangaService, sourceToHelperShape } from "./client.js";
export type { RuntimeLike } from "./client.js";

export { OtaManager, OTA_BASE } from "./ota.js";

export { ParserRuntime, BROWSER_UA } from "./runtime.js";
export type { CallArgs, ParserMethod } from "./runtime.js";

export { NyoraServer } from "./server.js";

export {
  defaultPortFile,
  readBaseUrlFromPortFile,
  BASE_URL_ENV,
  HELPER_PORT_FILE_ENV,
} from "./config.js";

export {
  NyoraError,
  ParserRuntimeError,
  HelperNotFoundError,
  NyoraHTTPError,
} from "./errors.js";

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
  OtaManifest,
  OtaArtifact,
  OtaUpdateResult,
  OtaUpdateAvailability,
} from "./types.js";

import { Nyora } from "./client.js";
/** The default export is the {@link Nyora} client class. */
export default Nyora;
