import { afterEach, describe, expect, it, vi } from "vitest";

import { NyoraSync } from "../src/sync.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("NyoraSync", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("signs in with the password grant and stores tokens", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ access_token: "a", refresh_token: "r" }));
    vi.stubGlobal("fetch", fetchMock);

    const sync = new NyoraSync({ tokenPath: null });
    await sync.signIn("Me@X.com", "pw");

    expect(sync.isSignedIn).toBe(true);
    expect(sync.email).toBe("me@x.com");
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(String(init.body)).toContain("grant_type=password");
    expect(String(init.body)).toContain("username=Me%40X.com");
  });

  it("upserts with a bearer token and returns the count", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: "a", refresh_token: "r" }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, count: 2 }));
    vi.stubGlobal("fetch", fetchMock);

    const sync = new NyoraSync({ tokenPath: null });
    await sync.signIn("me@x.com", "pw");
    const n = await sync.upsert("nyora_manga", [{ id: "1" }, { id: "2" }]);

    expect(n).toBe(2);
    const init = fetchMock.mock.calls[1][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer a");
  });

  it("refreshes once on 401 and retries with the new token", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: "a1", refresh_token: "r1" })) // sign in
      .mockResolvedValueOnce(jsonResponse({}, 401)) // sync -> 401
      .mockResolvedValueOnce(jsonResponse({ access_token: "a2", refresh_token: "r2" })) // refresh
      .mockResolvedValueOnce(jsonResponse({ data: [{ manga_id: "x" }] })); // retry
    vi.stubGlobal("fetch", fetchMock);

    const sync = new NyoraSync({ tokenPath: null });
    await sync.signIn("me@x.com", "pw");
    const rows = await sync.select("nyora_favourite");

    expect(rows).toEqual([{ manga_id: "x" }]);
    const retryInit = fetchMock.mock.calls[3][1] as RequestInit;
    expect((retryInit.headers as Record<string, string>).Authorization).toBe("Bearer a2");
  });

  it("throws when syncing while signed out", async () => {
    const sync = new NyoraSync({ tokenPath: null });
    await expect(sync.upsert("nyora_manga", [{ id: "1" }])).rejects.toThrow(/not signed in/);
  });
});
