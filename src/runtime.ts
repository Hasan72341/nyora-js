/**
 * Embedded JavaScript parser runtime for Nyora (Node + jsdom).
 *
 * Hosts {@link ParserRuntime}, the no-helper execution engine that runs Nyora's
 * bundled JavaScript parsers (`parsers.bundle.js`) inside a {@link
 * https://github.com/jsdom/jsdom | jsdom} window. The bundle defines a global
 * `NyoraParsers` object whose parsers call back into a `context` object for the
 * things they cannot do alone:
 *
 * - HTTP requests are served by Node's native `fetch` (`httpGet` / `httpPost`).
 * - HTML parsing is served by jsdom (`parseHTML`).
 *
 * Unlike the Python (QuickJS) path, modern Node already provides `atob`/`btoa`,
 * `TextEncoder`/`TextDecoder`, `URL`, `fetch`, and `crypto`, and jsdom provides
 * a full DOM — so no hand-written polyfills are needed and coverage exceeds the
 * QuickJS path.
 *
 * The runtime is deliberately *tolerant*: HTTP callbacks return the response
 * body for ANY status (and `""` on a transport failure) instead of throwing,
 * and `parseHTML("")` never throws. This is what keeps the widest range of
 * real-world sources working.
 *
 * @packageDocumentation
 */

import { JSDOM } from "jsdom";

import { ParserRuntimeError } from "./errors.js";
import { OtaManager } from "./ota.js";

/** Browser-like User-Agent sent with every parser HTTP request. */
export const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/** A parser object as returned by `NyoraParsers.getParser`. */
interface Parser {
  domain?: string;
  getListPage(page: number, order: string, filter: unknown): unknown;
  getDetails(manga: unknown): unknown;
  getPages(chapter: unknown): unknown;
}

/** The `NyoraParsers` global exposed by the bundle. */
interface NyoraParsersGlobal {
  getAllSources(): unknown;
  getParser(sourceId: string, context: ParserContext): Parser | null | undefined;
}

/** The callback context handed to each parser. */
interface ParserContext {
  httpGet(url: string, parser?: Parser): Promise<string>;
  httpPost(
    url: string,
    body?: string,
    extraHeaders?: Record<string, string>,
    parser?: Parser,
  ): Promise<string>;
  parseHTML(html: string): unknown;
  decodeContent(value: string): string;
}

/** Arguments accepted by {@link ParserRuntime.call}. */
export interface CallArgs {
  /** One-based page number for list methods. */
  page?: number;
  /** Free-text query for `search`. */
  query?: string;
  /** Manga or chapter URL for `details`/`pages`. */
  url?: string;
  /** Known title passed through to `details`. */
  title?: string;
  /** Pre-built manga object passed through to `details`. */
  manga?: unknown;
  /** Scanlation branch passed through to `pages`. */
  branch?: string | null;
  /** Extra filter object passed through to list methods. */
  filter?: Record<string, unknown>;
}

/** Methods that {@link ParserRuntime.call} can dispatch. */
export type ParserMethod = "popular" | "latest" | "search" | "details" | "pages";

/**
 * Run Nyora's bundled JavaScript parsers inside an embedded jsdom window.
 *
 * A single instance owns one jsdom `window` with the evaluated `NyoraParsers`
 * global. Parser calls are dispatched through a tolerant {@link ParserContext}
 * that proxies HTTP to Node's native `fetch` and HTML parsing to jsdom.
 *
 * @example
 * ```ts
 * const rt = new ParserRuntime();
 * const sources = rt.sources();
 * const popular = await rt.call("MANGADEX", "popular", { page: 1 });
 * rt.close();
 * ```
 */
export class ParserRuntime {
  private readonly _ota: OtaManager;
  private _dom!: JSDOM;
  private _parsers!: NyoraParsersGlobal;
  private _context!: ParserContext;
  /** Per-source domain overrides applied after a cross-host redirect. */
  private readonly _domainOverrides: Record<string, string> = {};

  /**
   * Initialize the runtime and build the jsdom context.
   *
   * @param options - Optional configuration.
   * @param options.ota - An {@link OtaManager} to source the bundle text from.
   *   When omitted, a default manager is created (using the cache, then the
   *   bundled fallback asset).
   */
  constructor(options: { ota?: OtaManager } = {}) {
    this._ota = options.ota ?? new OtaManager();
    this._buildContext();
  }

  private _buildContext(): void {
    this._dom = new JSDOM("<!DOCTYPE html><html><head></head><body></body></html>", {
      url: "https://example.com",
    });
    const window = this._dom.window;

    this._context = this._makeContext();

    // Evaluate the bundle in the jsdom window and capture the global.
    const bundleCode = this._ota.readBundleText();
    const factory = new window.Function(
      "window",
      "console",
      `${bundleCode}; return NyoraParsers;`,
    ) as (w: unknown, c: Console) => NyoraParsersGlobal;
    const parsers = factory(window, console);
    if (!parsers || typeof parsers.getAllSources !== "function") {
      throw new ParserRuntimeError("Parser bundle did not expose NyoraParsers");
    }
    this._parsers = parsers;
  }

  private _makeContext(): ParserContext {
    const self = this;
    return {
      async httpGet(url: string, parser?: Parser): Promise<string> {
        return self._http("GET", url, undefined, undefined, parser);
      },
      async httpPost(
        url: string,
        body?: string,
        extraHeaders?: Record<string, string>,
        parser?: Parser,
      ): Promise<string> {
        return self._http("POST", url, body, extraHeaders, parser);
      },
      parseHTML(html: string): unknown {
        try {
          const dom = new JSDOM(String(html ?? ""));
          return dom.window.document.documentElement;
        } catch {
          const dom = new JSDOM("");
          return dom.window.document.documentElement;
        }
      },
      decodeContent(value: string): string {
        return value;
      },
    };
  }

  private async _http(
    method: "GET" | "POST",
    url: string,
    body?: string,
    extraHeaders?: Record<string, string>,
    parser?: Parser,
  ): Promise<string> {
    const domain = parser?.domain ?? "";
    const origin = domain ? `https://${domain}` : "";
    const headers: Record<string, string> = {
      "User-Agent": BROWSER_UA,
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
      "Accept-Encoding": "identity",
      "Cache-Control": "no-cache",
    };
    if (origin) headers["Referer"] = `${origin}/`;
    if (method === "POST") {
      headers["Content-Type"] = "application/x-www-form-urlencoded";
      headers["X-Requested-With"] = "XMLHttpRequest";
      if (origin) headers["Origin"] = origin;
    }
    if (extraHeaders) Object.assign(headers, extraHeaders);

    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers,
        body: method === "POST" ? (body ?? "") : undefined,
        redirect: "follow",
      });
    } catch {
      // Transport/network failure: return empty string, never throw into JS.
      return "";
    }

    // On a cross-host redirect, pin the parser's domain to the final hostname.
    if (parser && res.url) {
      try {
        const finalHost = new URL(res.url).hostname;
        const originalHost = new URL(url).hostname;
        if (finalHost && originalHost && finalHost !== originalHost) {
          parser.domain = finalHost;
          this._domainOverrides[finalHost] = finalHost;
        }
      } catch {
        /* ignore */
      }
    }

    try {
      // Return the body text for ANY status code (no throw on non-2xx).
      return await res.text();
    } catch {
      return "";
    }
  }

  /**
   * Rebuild the jsdom context from the (possibly updated) bundle.
   *
   * Re-reads the parser bundle via the {@link OtaManager} and recreates the
   * jsdom window from scratch. Call this after an OTA update so the new parsers
   * take effect.
   */
  reload(): void {
    this.close();
    this._buildContext();
  }

  /** Release the jsdom window. Safe to call more than once. */
  close(): void {
    try {
      this._dom?.window?.close();
    } catch {
      /* ignore */
    }
  }

  /**
   * Return the catalog of available sources as raw parser metadata objects.
   *
   * @returns The descriptors exactly as emitted by
   *   `NyoraParsers.getAllSources()` (camelCase keys), or an empty array if the
   *   bundle returns something other than an array.
   */
  sources(): Record<string, unknown>[] {
    const raw = this._parsers.getAllSources();
    return Array.isArray(raw) ? (raw as Record<string, unknown>[]) : [];
  }

  /**
   * Invoke one parser method and return its decoded result.
   *
   * @param sourceId - The source identifier, with or without the `parser:`
   *   prefix.
   * @param method - One of `popular`, `latest`, `search`, `details`, or
   *   `pages`.
   * @param args - Method arguments (e.g. `page`, `query`, `url`, `manga`,
   *   `branch`, `filter`) passed through to the parser.
   * @returns The parser result as native JS objects.
   * @throws {@link ParserRuntimeError} If the parser is missing, the method is
   *   unknown, or the parser/engine fails.
   */
  async call(sourceId: string, method: ParserMethod, args: CallArgs = {}): Promise<unknown> {
    const cleanId = sourceId.startsWith("parser:") ? sourceId.slice("parser:".length) : sourceId;
    let parser: Parser | null | undefined;
    try {
      parser = this._parsers.getParser(cleanId, this._context);
    } catch (err) {
      throw new ParserRuntimeError(`${sourceId} ${method} failed: ${describe(err)}`);
    }
    if (!parser) {
      throw new ParserRuntimeError(`Parser not found: ${cleanId}`);
    }

    try {
      const page = args.page ?? 1;
      let call: unknown;
      switch (method) {
        case "popular":
          call = parser.getListPage(page, "POPULARITY", args.filter ?? {});
          break;
        case "latest":
          call = parser.getListPage(page, "UPDATED", args.filter ?? {});
          break;
        case "search":
          call = parser.getListPage(page, "RELEVANCE", { query: args.query ?? "" });
          break;
        case "details":
          call = parser.getDetails(
            args.manga ?? { id: args.url, url: args.url, title: args.title ?? "" },
          );
          break;
        case "pages":
          call = parser.getPages({
            id: args.url,
            url: args.url,
            branch: args.branch,
            source: { id: cleanId },
          });
          break;
        default:
          throw new ParserRuntimeError(`Unknown parser method: ${method}`);
      }
      const result = await Promise.resolve(call);
      // Round-trip through JSON to detach from any jsdom-backed objects.
      return JSON.parse(JSON.stringify(result ?? null));
    } catch (err) {
      if (err instanceof ParserRuntimeError) throw err;
      throw new ParserRuntimeError(`${sourceId} ${method} failed: ${describe(err)}`);
    }
  }
}

/** Render an unknown thrown value as a short message. */
function describe(err: unknown): string {
  if (err instanceof Error) return err.stack || err.message || err.name;
  return String(err);
}
