/**
 * Node HTTP server exposing the helper-compatible REST contract.
 *
 * {@link NyoraServer} lets the JS SDK act as a Nyora helper. It serves the same
 * camelCase REST endpoints the JVM helper (and the Python `NyoraServer`) expose
 * — `/health`, `/sources`, `/sources/popular`/`/latest`/`/search`,
 * `/manga/details`, `/manga/pages` — but backs them with an embedded
 * {@link ParserRuntime}. On start it can write the discovered port to the
 * standard helper port file, so other Nyora apps and clients can attach
 * automatically.
 *
 * Requests are serialized onto the single jsdom-backed runtime via a promise
 * chain, and every error is returned as clean JSON rather than a 500 stack
 * trace.
 *
 * @packageDocumentation
 */

import * as fs from "node:fs";
import * as http from "node:http";
import * as path from "node:path";
import { AddressInfo } from "node:net";

import { defaultPortFile } from "./config.js";
import { NyoraError } from "./errors.js";
import { ParserRuntime } from "./runtime.js";
import { sourceToHelperShape } from "./client.js";
import type { CallArgs, ParserMethod } from "./runtime.js";

/** The runtime surface {@link NyoraServer} needs. */
interface ServerRuntime {
  sources(): Record<string, unknown>[];
  call(sourceId: string, method: string, args: CallArgs): Promise<unknown>;
  close(): void;
}

/**
 * Serve the camelCase helper REST contract over an embedded runtime.
 *
 * Exposes the Nyora helper REST API backed by a {@link ParserRuntime}, so any
 * Nyora client can talk to the JS SDK as if it were the JVM helper.
 *
 * @example
 * ```ts
 * const server = new NyoraServer();
 * const baseUrl = await server.start(); // background, returns the URL
 * // ... attach a client to baseUrl ...
 * await server.stop();
 * ```
 */
export class NyoraServer {
  private readonly _host: string;
  private _port: number;
  private readonly _ownsRuntime: boolean;
  private readonly _runtime: ServerRuntime;
  private readonly _writePortFile: boolean;
  private _httpd: http.Server | null = null;
  /** Tail of the serialization chain; runtime calls run one at a time. */
  private _queue: Promise<unknown> = Promise.resolve();

  /**
   * Initialize the server.
   *
   * @param options - Server options.
   * @param options.host - Interface to bind. Defaults to loopback.
   * @param options.port - Port to bind, or `0` to pick a free ephemeral port.
   * @param options.runtime - An existing runtime to serve. When omitted, a new
   *   {@link ParserRuntime} is created and owned (closed on {@link stop}).
   * @param options.writePortFile - Whether to write the bound port to the
   *   standard helper port file so other apps can discover this server.
   *   Defaults to `true`.
   */
  constructor(
    options: {
      host?: string;
      port?: number;
      runtime?: ServerRuntime;
      writePortFile?: boolean;
    } = {},
  ) {
    this._host = options.host ?? "127.0.0.1";
    this._port = options.port ?? 0;
    this._ownsRuntime = options.runtime === undefined;
    this._runtime = options.runtime ?? new ParserRuntime();
    this._writePortFile = options.writePortFile ?? true;
  }

  /**
   * The base URL the server is bound to.
   *
   * @returns The `http://host:port` base URL.
   * @throws {@link NyoraError} If the server has not been started yet.
   */
  get baseUrl(): string {
    if (this._httpd === null) {
      throw new NyoraError("Server is not running; call start() first");
    }
    const addr = this._httpd.address() as AddressInfo;
    return `http://${this._host}:${addr.port}`;
  }

  /**
   * Start serving in the background.
   *
   * Idempotent: calling it again while running resolves to the existing URL.
   *
   * @returns The base URL the server is bound to.
   */
  async start(): Promise<string> {
    if (this._httpd) return this.baseUrl;
    const server = http.createServer((req, res) => {
      this._handle(req, res);
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(this._port, this._host, () => {
        server.removeListener("error", reject);
        resolve();
      });
    });
    this._httpd = server;
    this._port = (server.address() as AddressInfo).port;
    if (this._writePortFile) this._persistPortFile(this._port);
    return this.baseUrl;
  }

  /**
   * Stop the server and release its resources.
   *
   * Closes the listening socket and closes an owned runtime. Safe to call when
   * not running.
   */
  async stop(): Promise<void> {
    if (this._httpd) {
      const server = this._httpd;
      this._httpd = null;
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    if (this._ownsRuntime) this._runtime.close();
  }

  private _persistPortFile(port: number): void {
    const file = defaultPortFile();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, String(port), "utf-8");
  }

  /** Run a runtime call serialized after any in-flight call. */
  private _serial<T>(fn: () => Promise<T>): Promise<T> {
    const next = this._queue.then(fn, fn);
    this._queue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  private _handle(req: http.IncomingMessage, res: http.ServerResponse): void {
    const url = new URL(req.url ?? "/", `http://${this._host}`);
    this._dispatch(url.pathname, url.searchParams)
      .then(([status, body]) => sendJson(res, status, body))
      .catch((err: unknown) => {
        if (err instanceof BadRequest) {
          sendJson(res, 400, { error: err.message });
        } else if (err instanceof RangeError && err.name === "NotFound") {
          sendJson(res, 404, { error: err.message });
        } else if (err instanceof NyoraError) {
          sendJson(res, 502, { error: err.message });
        } else {
          const name = err instanceof Error ? err.name : "Error";
          const msg = err instanceof Error ? err.message : String(err);
          sendJson(res, 500, { error: `${name}: ${msg}` });
        }
      });
  }

  private async _dispatch(
    pathname: string,
    query: URLSearchParams,
  ): Promise<[number, Record<string, unknown>]> {
    if (pathname === "/health") {
      return [200, { ok: true, engine: "node-jsdom" }];
    }

    if (pathname === "/sources") {
      const sources = await this._serial(async () =>
        this._runtime.sources().map(sourceToHelperShape),
      );
      return [200, { sources }];
    }

    if (
      pathname === "/sources/popular" ||
      pathname === "/sources/latest" ||
      pathname === "/sources/search"
    ) {
      const sourceId = required(query, "id");
      const page = intParam(query, "page", 1);
      let method: ParserMethod;
      const args: CallArgs = { page };
      if (pathname.endsWith("/popular")) {
        method = "popular";
      } else if (pathname.endsWith("/latest")) {
        method = "latest";
      } else {
        method = "search";
        args.query = required(query, "q");
      }
      const data = await this._serial(() => this._runtime.call(sourceId, method, args));
      const entries = Array.isArray(data) ? data : [];
      return [200, { entries, hasNextPage: entries.length > 0 }];
    }

    if (pathname === "/manga/details") {
      const sourceId = required(query, "id");
      const url = required(query, "url");
      const title = query.get("title") ?? "";
      const manga = await this._serial(() =>
        this._runtime.call(sourceId, "details", { url, title }),
      );
      const chapters =
        manga && typeof manga === "object" && !Array.isArray(manga)
          ? (manga as Record<string, unknown>).chapters
          : [];
      return [200, { manga, chapters: Array.isArray(chapters) ? chapters : [] }];
    }

    if (pathname === "/manga/pages") {
      const sourceId = required(query, "id");
      const url = required(query, "url");
      const branch = query.get("branch");
      const data = await this._serial(() =>
        this._runtime.call(sourceId, "pages", { url, branch }),
      );
      const pages = Array.isArray(data) ? data : [];
      return [200, { pages }];
    }

    const notFound = new RangeError(`Not found: ${pathname}`);
    notFound.name = "NotFound";
    throw notFound;
  }
}

/** Internal signal for a 400 response. */
class BadRequest extends Error {}

/** Return a required query parameter or throw {@link BadRequest}. */
function required(query: URLSearchParams, name: string): string {
  const value = query.get(name);
  if (!value) throw new BadRequest(`Missing required query parameter: '${name}'`);
  return value;
}

/** Read an integer query parameter with a default. */
function intParam(query: URLSearchParams, name: string, fallback: number): number {
  const raw = query.get(name);
  if (raw === null) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n)) throw new BadRequest(`Query parameter '${name}' must be an integer`);
  return n;
}

/** Write a JSON response body. */
function sendJson(res: http.ServerResponse, status: number, body: Record<string, unknown>): void {
  const payload = Buffer.from(JSON.stringify(body), "utf-8");
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": String(payload.length),
  });
  res.end(payload);
}
