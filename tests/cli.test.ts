import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The CLI imports these modules lazily/at module scope; mock them before import.
const tuiRun = vi.fn(async () => 0);
vi.mock("../src/tui.js", () => ({ run: tuiRun }));

// A stub Nyora client used by every subcommand, so no jsdom/network is touched.
const sourcesList = vi.fn(() => [
  {
    id: "MANGADEX",
    name: "MangaDex",
    lang: "en",
    baseUrl: "https://mangadex.org",
    engine: "JavaScript",
    contentType: "Manga",
    isInstalled: true,
    isPinned: false,
    isNsfw: false,
    isObsolete: false,
    iconUrl: "",
    version: "",
    notes: "",
    canUninstall: false,
  },
]);
const sourcesFind = vi.fn((q: string) => {
  const all = sourcesList();
  const needle = q.toLowerCase();
  const hit = all.find(
    (s) => s.id.toLowerCase().includes(needle) || s.name.toLowerCase().includes(needle),
  );
  if (!hit) throw new Error(`No bundled source matched '${q}'`);
  return hit;
});
const mangaPopular = vi.fn(async () => ({
  entries: [{ ...mangaStub("First", "/m/1") }, { ...mangaStub("Second", "/m/2") }],
  hasNextPage: true,
}));
const clientClose = vi.fn();

function mangaStub(title: string, url: string): Record<string, unknown> {
  return {
    id: url,
    title,
    altTitles: [],
    url,
    publicUrl: "",
    rating: -1,
    isNsfw: false,
    contentRating: null,
    coverUrl: "",
    largeCoverUrl: null,
    state: null,
    authors: [],
    source: {},
    sourceId: "",
    description: "",
    tags: [],
    chapters: [],
    unread: 0,
    progress: 0,
  };
}

vi.mock("../src/client.js", () => ({
  Nyora: vi.fn().mockImplementation(() => ({
    sources: { list: sourcesList, find: sourcesFind },
    manga: { popular: mangaPopular },
    close: clientClose,
  })),
}));

// Import after the mocks are registered.
import { main } from "../src/cli.js";

let stdoutSpy: ReturnType<typeof vi.spyOn>;
let stderrSpy: ReturnType<typeof vi.spyOn>;
let out: string;
let errOut: string;

beforeEach(() => {
  out = "";
  errOut = "";
  stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
    out += String(chunk);
    return true;
  });
  stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation((chunk: unknown) => {
    errOut += String(chunk);
    return true;
  });
});

afterEach(() => {
  stdoutSpy.mockRestore();
  stderrSpy.mockRestore();
  vi.clearAllMocks();
});

describe("nyora-cli main()", () => {
  it("bare invocation (no subcommand) launches the TUI", async () => {
    const code = await main([]);
    expect(tuiRun).toHaveBeenCalledTimes(1);
    expect(code).toBe(0);
  });

  it("global flags without a subcommand still launch the TUI", async () => {
    const code = await main(["--json"]);
    expect(tuiRun).toHaveBeenCalledTimes(1);
    expect(code).toBe(0);
  });

  it("--help prints usage and does not start the TUI", async () => {
    const code = await main(["--help"]);
    expect(code).toBe(0);
    expect(tuiRun).not.toHaveBeenCalled();
    expect(out).toContain("nyora-cli");
    expect(out).toContain("Commands:");
  });

  it("sources lists bundled sources", async () => {
    const code = await main(["sources"]);
    expect(code).toBe(0);
    expect(sourcesList).toHaveBeenCalled();
    expect(out).toContain("MANGADEX");
    expect(out).toContain("(1 sources)");
    expect(clientClose).toHaveBeenCalled();
  });

  it("sources --json emits JSON", async () => {
    const code = await main(["--json", "sources"]);
    expect(code).toBe(0);
    const parsed = JSON.parse(out);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0].id).toBe("MANGADEX");
  });

  it("popular resolves the source and renders entries", async () => {
    const code = await main(["popular", "-s", "mangadex"]);
    expect(code).toBe(0);
    expect(sourcesFind).toHaveBeenCalledWith("mangadex");
    expect(mangaPopular).toHaveBeenCalledWith("MANGADEX", 1);
    expect(out).toContain("Popular (MangaDex)");
    expect(out).toContain("First");
    expect(out).toContain("more available");
  });

  it("popular --json forwards the page flag", async () => {
    const code = await main(["--json", "popular", "-s", "mangadex", "-p", "3"]);
    expect(code).toBe(0);
    expect(mangaPopular).toHaveBeenCalledWith("MANGADEX", 3);
    const parsed = JSON.parse(out);
    expect(parsed.entries).toHaveLength(2);
  });

  it("missing --source is a clean error (exit 1, no stack)", async () => {
    const code = await main(["popular"]);
    expect(code).toBe(1);
    expect(errOut).toContain("error:");
    expect(errOut).toContain("--source");
    expect(errOut).not.toContain("at ");
  });

  it("unknown command returns exit 2 with usage", async () => {
    const code = await main(["frobnicate"]);
    expect(code).toBe(2);
    expect(errOut).toContain("unknown command: frobnicate");
  });
});

describe("tui run() non-TTY safety", () => {
  let isTty: boolean | undefined;

  beforeEach(() => {
    isTty = process.stdout.isTTY;
    Object.defineProperty(process.stdout, "isTTY", { value: false, configurable: true });
  });

  afterEach(() => {
    Object.defineProperty(process.stdout, "isTTY", { value: isTty, configurable: true });
  });

  it("returns 0 and prints a notice without launching the UI", async () => {
    // Use the REAL tui module (the top-level mock replaces it module-wide).
    const tui = await vi.importActual<typeof import("../src/tui.js")>("../src/tui.js");
    const code = await tui.run();
    expect(code).toBe(0);
    expect(out).toContain("interactive terminal");
  });
});
