/**
 * Nyora cloud sync — account + library sync against the self-hosted sync server.
 *
 * {@link NyoraSync} talks to the Nyora sync server (`https://stream.hasanraza.tech`)
 * using an OAuth2 password flow + JWT, then a generic last-write-wins
 * upsert/select over the per-user tables (`nyora_manga`, `nyora_favourite`, …).
 * It mirrors the iOS `NyoraSyncClient` and replaces the old Supabase-based sync.
 *
 * Tokens are held in memory and, when a `tokenPath` is given, persisted to disk
 * so a process can stay signed in across runs.
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

/** Default Nyora sync server. */
export const SYNC_BASE_URL = "https://stream.hasanraza.tech";

function defaultTokenPath(): string {
  const base = process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config");
  return join(base, "nyora", "sync.json");
}

interface StoredTokens {
  access_token?: string;
  refresh_token?: string;
  email?: string;
}

/** Options for constructing a {@link NyoraSync}. */
export interface SyncOptions {
  /** Sync server base URL. Defaults to {@link SYNC_BASE_URL} or `NYORA_SYNC_URL`. */
  baseUrl?: string;
  /** Per-request timeout in ms. */
  timeoutMs?: number;
  /** File to persist tokens to. `null` disables persistence. */
  tokenPath?: string | null;
}

/** Raised when a sync operation is attempted without signing in. */
export class NotSignedInError extends Error {
  constructor() {
    super("not signed in; call signIn() first");
    this.name = "NotSignedInError";
  }
}

/** Account and library sync against the Nyora sync server. */
export class NyoraSync {
  readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly tokenPath: string | null;
  email: string | null = null;
  private access: string | null = null;
  private refresh: string | null = null;

  constructor(options: SyncOptions = {}) {
    const base = options.baseUrl ?? process.env.NYORA_SYNC_URL ?? SYNC_BASE_URL;
    this.baseUrl = base.replace(/\/+$/, "");
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.tokenPath = options.tokenPath === undefined ? defaultTokenPath() : options.tokenPath;
    this.loadTokens();
  }

  /** Whether an access token is currently held. */
  get isSignedIn(): boolean {
    return this.access !== null;
  }

  // -- state -----------------------------------------------------------------

  private loadTokens(): void {
    if (!this.tokenPath || !existsSync(this.tokenPath)) return;
    try {
      const data = JSON.parse(readFileSync(this.tokenPath, "utf8")) as StoredTokens;
      this.access = data.access_token ?? null;
      this.refresh = data.refresh_token ?? null;
      this.email = data.email ?? null;
    } catch {
      /* ignore */
    }
  }

  private saveTokens(): void {
    if (!this.tokenPath) return;
    try {
      mkdirSync(dirname(this.tokenPath), { recursive: true });
      writeFileSync(
        this.tokenPath,
        JSON.stringify({ access_token: this.access, refresh_token: this.refresh, email: this.email }),
      );
    } catch {
      /* ignore */
    }
  }

  private store(tokens: { access_token?: string; refresh_token?: string }): void {
    this.access = tokens.access_token ?? null;
    this.refresh = tokens.refresh_token ?? null;
    this.saveTokens();
  }

  // -- transport -------------------------------------------------------------

  private async request(path: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await fetch(this.baseUrl + path, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  // -- auth ------------------------------------------------------------------

  /** Register a new account (server may have registration disabled). */
  async register(email: string, password: string): Promise<void> {
    const res = await this.request("/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) throw new Error(`register failed: HTTP ${res.status}`);
    this.email = email.toLowerCase().trim();
    this.store(await res.json());
  }

  /** Sign in with the OAuth2 password grant and store the tokens. */
  async signIn(email: string, password: string): Promise<void> {
    const tokens = await this.tokenForm({ grant_type: "password", username: email, password });
    this.email = email.toLowerCase().trim();
    this.store(tokens);
  }

  /** Forget the stored tokens. */
  signOut(): void {
    this.access = this.refresh = this.email = null;
    if (this.tokenPath && existsSync(this.tokenPath)) {
      try {
        rmSync(this.tokenPath);
      } catch {
        /* ignore */
      }
    }
  }

  private async refreshTokens(): Promise<void> {
    if (!this.refresh) throw new NotSignedInError();
    this.store(await this.tokenForm({ grant_type: "refresh_token", refresh_token: this.refresh }));
  }

  private async tokenForm(fields: Record<string, string>): Promise<{ access_token: string; refresh_token: string }> {
    const res = await this.request("/auth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(fields).toString(),
    });
    if (!res.ok) throw new Error(`token request failed: HTTP ${res.status}`);
    return (await res.json()) as { access_token: string; refresh_token: string };
  }

  // -- sync ------------------------------------------------------------------

  private async sync(payload: Record<string, unknown>, retry = true): Promise<Record<string, unknown>> {
    if (!this.access) throw new NotSignedInError();
    const res = await this.request("/functions/v1/nyora-sync", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.access}` },
      body: JSON.stringify(payload),
    });
    if (res.status === 401 && retry && this.refresh) {
      await this.refreshTokens();
      return this.sync(payload, false);
    }
    if (!res.ok) throw new Error(`sync failed: HTTP ${res.status}`);
    return (await res.json()) as Record<string, unknown>;
  }

  /** Last-write-wins upsert of `rows` into `table`. Returns rows written. */
  async upsert(table: string, rows: Record<string, unknown>[]): Promise<number> {
    if (rows.length === 0) return 0;
    const res = await this.sync({ action: "upsert", table, rows });
    return Number(res.count ?? 0);
  }

  /** Fetch rows from `table`, optionally only those changed after `since`. */
  async select(table: string, since?: string): Promise<Record<string, unknown>[]> {
    const payload: Record<string, unknown> = { action: "select", table };
    if (since !== undefined) payload.since = since;
    const res = await this.sync(payload);
    return (res.data as Record<string, unknown>[]) ?? [];
  }

  /** Hard-delete one extension-repo row for the signed-in user. */
  async deleteExtensionRepo(type: string, baseUrl: string): Promise<void> {
    await this.sync({ action: "deleteExtensionRepo", type, base_url: baseUrl });
  }
}
