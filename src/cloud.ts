/**
 * Cloud transport for the Nyora SDK.
 *
 * {@link CloudClient} is a thin wrapper over `fetch` that talks to the Nyora
 * cloud helper (`https://api.hasanraza.tech`) — the same camelCase REST contract
 * the JVM helper exposes (`/sources`, `/sources/popular`/`/latest`/`/search`,
 * `/manga/details`, `/manga/pages`). It replaces the old in-process JavaScript
 * parser runtime: the SDK is now a cloud client, not a parser host.
 */

import type { JsonDict } from "./types.js";

/** Default public Nyora cloud helper. */
export const CLOUD_BASE_URL = "https://api.hasanraza.tech";

/** Options for constructing a {@link CloudClient}. */
export interface CloudOptions {
  /** Helper base URL. Defaults to {@link CLOUD_BASE_URL} or `NYORA_BASE_URL`. */
  baseUrl?: string;
  /** Per-request timeout in milliseconds. */
  timeoutMs?: number;
}

/** Thin fetch client for the Nyora cloud helper REST contract. */
export class CloudClient {
  readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(options: CloudOptions = {}) {
    const base = options.baseUrl ?? process.env.NYORA_BASE_URL ?? CLOUD_BASE_URL;
    this.baseUrl = base.replace(/\/+$/, "");
    this.timeoutMs = options.timeoutMs ?? 120_000;
  }

  /** GET a helper endpoint and decode the JSON body. */
  async get<T = JsonDict>(path: string, params: Record<string, string | number> = {}): Promise<T> {
    const url = new URL(this.baseUrl + path);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try {
          const body = (await res.json()) as { error?: string };
          if (body?.error) msg = body.error;
        } catch {
          /* ignore */
        }
        throw new Error(msg);
      }
      return (await res.json()) as T;
    } finally {
      clearTimeout(timer);
    }
  }

  /** Ask the helper to install (load) a parser source. Best-effort. */
  async install(id: string): Promise<void> {
    const url = new URL(this.baseUrl + "/sources/install");
    url.searchParams.set("id", id);
    try {
      await fetch(url, { method: "POST" });
    } catch {
      /* best-effort */
    }
  }

  /**
   * GET a source endpoint; if it fails because the source isn't loaded on the
   * helper yet, install it and retry once.
   */
  async getEnsuringInstalled<T = JsonDict>(
    path: string,
    id: string,
    params: Record<string, string | number> = {},
  ): Promise<T> {
    try {
      return await this.get<T>(path, { id, ...params });
    } catch (err) {
      if (err instanceof Error && err.message.toLowerCase().includes("not installed")) {
        await this.install(id);
        return await this.get<T>(path, { id, ...params });
      }
      throw err;
    }
  }
}
