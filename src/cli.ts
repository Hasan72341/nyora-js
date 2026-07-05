#!/usr/bin/env node
/**
 * Command-line interface for the independent Nyora SDK (`nyora-cli`).
 *
 * Exposes the embedded JavaScript parser runtime (no helper required) through a
 * small subcommand tree that mirrors the Python `nyora-cli`: list sources, run
 * popular/latest/search, fetch manga details and chapter pages, download a
 * chapter as a .cbz archive, apply OTA parser updates, and serve the
 * helper-compatible HTTP API.
 *
 * Running `nyora-cli` with **no subcommand** launches the interactive terminal
 * reader (the {@link module:tui | TUI}) instead. Every subcommand keeps working
 * unchanged, and `nyora-cli --help` lists them.
 *
 * The {@link main} entry point returns a numeric exit code (it never calls
 * `process.exit` itself when imported), so it can be unit-tested offline.
 *
 * @packageDocumentation
 */

import { realpathSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";

import { Nyora } from "./client.js";
import type { Manga, MangaChapter, MangaPage, SearchPage, Source } from "./types.js";

/** User-Agent for direct image downloads. */
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/** Friendly, no-stack error wrapper recognized by {@link main}. */
class CliError extends Error {}

/** Parsed global flags shared by every subcommand. */
interface GlobalFlags {
  json: boolean;
}

/** A minimal flag/positional parse result. */
interface ParsedArgs {
  positionals: string[];
  flags: Map<string, string | boolean>;
}

/**
 * Parse a subcommand's argv into positionals plus flags.
 *
 * Supports `--name value`, `--name=value`, and registered short aliases. Flags
 * named in `booleans` consume no value; everything else takes the next token.
 *
 * @param argv - Tokens after the subcommand name.
 * @param spec - Flag spec: `aliases` maps short to long, `booleans` lists
 *   value-less flags.
 * @returns The parsed positionals and flags.
 */
function parseFlags(
  argv: string[],
  spec: { aliases?: Record<string, string>; booleans?: string[] } = {},
): ParsedArgs {
  const aliases = spec.aliases ?? {};
  const booleans = new Set(spec.booleans ?? []);
  const positionals: string[] = [];
  const flags = new Map<string, string | boolean>();

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--") {
      positionals.push(...argv.slice(i + 1));
      break;
    }
    if (token.startsWith("-") && token !== "-") {
      let raw = token.replace(/^-+/, "");
      let inlineValue: string | undefined;
      const eq = raw.indexOf("=");
      if (eq !== -1) {
        inlineValue = raw.slice(eq + 1);
        raw = raw.slice(0, eq);
      }
      const name = aliases[raw] ?? raw;
      if (booleans.has(name)) {
        flags.set(name, true);
      } else if (inlineValue !== undefined) {
        flags.set(name, inlineValue);
      } else {
        const next = argv[i + 1];
        if (next === undefined) {
          throw new CliError(`option --${name} requires a value`);
        }
        flags.set(name, next);
        i += 1;
      }
    } else {
      positionals.push(token);
    }
  }
  return { positionals, flags };
}

/** Read a required `-s/--source` flag, or throw a friendly error. */
function requireSource(args: ParsedArgs): string {
  const value = args.flags.get("source");
  if (typeof value !== "string" || value.length === 0) {
    throw new CliError("the --source/-s option is required");
  }
  return value;
}

/** Read an optional `-p/--page` flag as a positive integer (default 1). */
function pageOf(args: ParsedArgs): number {
  const value = args.flags.get("page");
  if (value === undefined) return 1;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) {
    throw new CliError(`invalid page number: ${String(value)}`);
  }
  return Math.trunc(n);
}

/** Pretty-print a value as indented JSON. */
function printJson(payload: unknown): void {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

/** Print a plain line to stdout. */
function print(message = ""): void {
  process.stdout.write(`${message}\n`);
}

/** Print an `error: ...` line to stderr. */
function printError(message: string): void {
  process.stderr.write(`error: ${message}\n`);
}

// --------------------------------------------------------------------------- //
// Rendering
// --------------------------------------------------------------------------- //

function renderSources(sources: Source[]): void {
  for (const src of sources) {
    print(`${src.id}\t${src.name}\t${src.lang}`);
  }
  print(`(${sources.length} sources)`);
}

function renderEntries(page: SearchPage, title: string): void {
  print(title);
  page.entries.forEach((manga: Manga, index: number) => {
    print(`${String(index + 1).padStart(4)}  ${manga.title}\t${manga.url}`);
  });
  const more = page.hasNextPage ? ", more available" : "";
  print(`(${page.entries.length} entries${more})`);
}

function renderDetails(manga: Manga, chapters: MangaChapter[]): void {
  print(manga.title);
  if (manga.authors.length) print(`Authors: ${manga.authors.join(", ")}`);
  if (manga.state) print(`State: ${manga.state}`);
  if (manga.description) print(`\n${manga.description}\n`);
  print(`Chapters (${chapters.length}):`);
  chapters.forEach((chapter: MangaChapter, index: number) => {
    print(`${String(index + 1).padStart(4)}  ${chapter.title}\t${chapter.url}`);
  });
}

// --------------------------------------------------------------------------- //
// Download helpers
// --------------------------------------------------------------------------- //

/** Build the request headers used to download a page image. */
function pageHeaders(page: MangaPage): Record<string, string> {
  const headers: Record<string, string> = { "User-Agent": BROWSER_UA };
  for (const [key, value] of Object.entries(page.headers)) {
    headers[String(key)] = String(value);
  }
  if (!("Referer" in headers)) {
    try {
      const url = new URL(page.url);
      headers["Referer"] = `${url.protocol}//${url.host}/`;
    } catch {
      /* relative URL: skip Referer */
    }
  }
  return headers;
}

/** Choose a file suffix from the URL path, falling back to the content type. */
function suffixFor(url: string, contentType: string): string {
  let ext = "";
  try {
    ext = path.extname(new URL(url).pathname);
  } catch {
    ext = path.extname(url);
  }
  if (ext && ext.length <= 5) return ext;
  const mapping: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "image/avif": ".avif",
  };
  const key = contentType.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  return mapping[key] ?? ".jpg";
}

/** CRC-32 lookup table (IEEE polynomial), built once. */
const CRC32_TABLE = ((): Uint32Array => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

/** Compute the CRC-32 checksum of a buffer. */
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = CRC32_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * Build a CBZ (ZIP, STORE method) archive in memory from named image entries.
 *
 * CBZ readers expect a plain ZIP of in-order image files. Page images are
 * already compressed, so entries are stored uncompressed (method 0).
 */
function buildCbz(entries: { name: string; data: Buffer }[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const crc = crc32(entry.data);
    const size = entry.data.length;

    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0); // local file header signature
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(0, 8); // method: store
    local.writeUInt16LE(0, 10); // mod time
    local.writeUInt16LE(0x21, 12); // mod date (1980-01-01)
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(size, 18); // compressed size
    local.writeUInt32LE(size, 22); // uncompressed size
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28); // extra length
    name.copy(local, 30);
    locals.push(local, entry.data);

    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0); // central directory signature
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0, 8); // flags
    central.writeUInt16LE(0, 10); // method: store
    central.writeUInt16LE(0, 12); // mod time
    central.writeUInt16LE(0x21, 14); // mod date
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(size, 20);
    central.writeUInt32LE(size, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30); // extra length
    central.writeUInt16LE(0, 32); // comment length
    central.writeUInt16LE(0, 34); // disk number start
    central.writeUInt16LE(0, 36); // internal attrs
    central.writeUInt32LE(0, 38); // external attrs
    central.writeUInt32LE(offset, 42); // local header offset
    name.copy(central, 46);
    centrals.push(central);

    offset += local.length + entry.data.length;
  }

  const localBuf = Buffer.concat(locals);
  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); // end of central directory signature
  end.writeUInt16LE(0, 4); // disk number
  end.writeUInt16LE(0, 6); // disk with central dir
  end.writeUInt16LE(entries.length, 8); // entries on this disk
  end.writeUInt16LE(entries.length, 10); // total entries
  end.writeUInt32LE(centralBuf.length, 12); // central dir size
  end.writeUInt32LE(localBuf.length, 16); // central dir offset
  end.writeUInt16LE(0, 20); // comment length
  return Buffer.concat([localBuf, centralBuf, end]);
}

/** Download every page and pack them into a single `.cbz` archive. */
async function downloadCbz(
  pages: MangaPage[],
  cbzPath: string,
): Promise<{ saved: number; total: number }> {
  const width = String(pages.length).length;
  const entries: { name: string; data: Buffer }[] = [];
  for (let index = 0; index < pages.length; index += 1) {
    const page = pages[index];
    let res: Response;
    try {
      res = await fetch(page.url, { headers: pageHeaders(page), redirect: "follow" });
    } catch (err) {
      printError(`page ${index + 1}: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }
    if (!res.ok) {
      printError(`page ${index + 1}: HTTP ${res.status}`);
      continue;
    }
    const data = Buffer.from(await res.arrayBuffer());
    const suffix = suffixFor(page.url, res.headers.get("content-type") ?? "");
    entries.push({ name: `${String(index + 1).padStart(width, "0")}${suffix}`, data });
  }
  if (entries.length) {
    await mkdir(path.dirname(cbzPath), { recursive: true });
    await writeFile(cbzPath, buildCbz(entries));
  }
  return { saved: entries.length, total: pages.length };
}

/** Slugify the last path segment of a chapter URL for use as a file name. */
function slugFromUrl(url: string): string {
  let pathname = url;
  try {
    pathname = new URL(url).pathname;
  } catch {
    /* relative URL: use as-is */
  }
  const segment = pathname.replace(/\/+$/, "").split("/").filter(Boolean).pop() ?? "";
  return safeName(segment) || "chapter";
}

/** Reduce a string to a filesystem-safe file name. */
function safeName(value: string): string {
  return value
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120);
}

/**
 * Resolve the `-o/--out` value to a concrete `.cbz` file path. `undefined` →
 * `<slug>.cbz` in the cwd; a `.cbz` value is used verbatim; anything else is
 * treated as a directory that will contain `<slug>.cbz`.
 */
function resolveCbzPath(outArg: string | undefined, slug: string): string {
  const name = `${slug}.cbz`;
  if (!outArg) return path.resolve(name);
  const expanded = outArg.startsWith("~") ? path.join(os.homedir(), outArg.slice(1)) : outArg;
  const resolved = path.resolve(expanded);
  if (resolved.toLowerCase().endsWith(".cbz")) return resolved;
  return path.join(resolved, name);
}

// --------------------------------------------------------------------------- //
// Command handlers
// --------------------------------------------------------------------------- //

async function cmdSources(argv: string[], globals: GlobalFlags): Promise<number> {
  const args = parseFlags(argv);
  const client = new Nyora();
  try {
    let sources = await client.sources.list();
    const search = args.flags.get("search");
    if (typeof search === "string" && search.length) {
      const needle = search.toLowerCase();
      sources = sources.filter(
        (s) => s.id.toLowerCase().includes(needle) || s.name.toLowerCase().includes(needle),
      );
    }
    if (globals.json) {
      printJson(sources);
      return 0;
    }
    renderSources(sources);
    return 0;
  } finally {
    client.close();
  }
}

async function cmdSearch(argv: string[], globals: GlobalFlags): Promise<number> {
  const args = parseFlags(argv, { aliases: { s: "source", p: "page" } });
  const query = args.positionals[0];
  if (!query) throw new CliError("a search query is required");
  const client = new Nyora();
  try {
    const source = await client.sources.find(requireSource(args));
    const page = await client.manga.search(source.id, query, pageOf(args));
    if (globals.json) printJson(page);
    else renderEntries(page, `Search: ${query}`);
    return 0;
  } finally {
    client.close();
  }
}

async function cmdPopular(argv: string[], globals: GlobalFlags): Promise<number> {
  const args = parseFlags(argv, { aliases: { s: "source", p: "page" } });
  const client = new Nyora();
  try {
    const source = await client.sources.find(requireSource(args));
    const page = await client.manga.popular(source.id, pageOf(args));
    if (globals.json) printJson(page);
    else renderEntries(page, `Popular (${source.name})`);
    return 0;
  } finally {
    client.close();
  }
}

async function cmdLatest(argv: string[], globals: GlobalFlags): Promise<number> {
  const args = parseFlags(argv, { aliases: { s: "source", p: "page" } });
  const client = new Nyora();
  try {
    const source = await client.sources.find(requireSource(args));
    const page = await client.manga.latest(source.id, pageOf(args));
    if (globals.json) printJson(page);
    else renderEntries(page, `Latest (${source.name})`);
    return 0;
  } finally {
    client.close();
  }
}

async function cmdDetails(argv: string[], globals: GlobalFlags): Promise<number> {
  const args = parseFlags(argv, { aliases: { s: "source" } });
  const url = args.positionals[0];
  if (!url) throw new CliError("a manga URL is required");
  const client = new Nyora();
  try {
    const source = await client.sources.find(requireSource(args));
    const details = await client.manga.details(source.id, url);
    if (globals.json) printJson(details);
    else renderDetails(details.manga, details.chapters);
    return 0;
  } finally {
    client.close();
  }
}

async function cmdPages(argv: string[], globals: GlobalFlags): Promise<number> {
  const args = parseFlags(argv, { aliases: { s: "source" } });
  const chapterUrl = args.positionals[0];
  if (!chapterUrl) throw new CliError("a chapter URL is required");
  const branch = args.flags.get("branch");
  const client = new Nyora();
  try {
    const source = await client.sources.find(requireSource(args));
    const pages = await client.manga.pages(source.id, chapterUrl, {
      branch: typeof branch === "string" ? branch : null,
    });
    if (globals.json) {
      printJson(pages);
      return 0;
    }
    pages.forEach((page: MangaPage, index: number) => {
      print(`${String(index + 1).padStart(4)}  ${page.url}`);
    });
    return 0;
  } finally {
    client.close();
  }
}

async function cmdDownload(argv: string[], globals: GlobalFlags): Promise<number> {
  const args = parseFlags(argv, { aliases: { s: "source", o: "out" } });
  const chapterUrl = args.positionals[0];
  if (!chapterUrl) throw new CliError("a chapter URL is required");
  const branch = args.flags.get("branch");
  const outFlag = args.flags.get("out");
  const cbzPath = resolveCbzPath(typeof outFlag === "string" ? outFlag : undefined, slugFromUrl(chapterUrl));

  const client = new Nyora();
  let pages: MangaPage[];
  try {
    const source = await client.sources.find(requireSource(args));
    pages = await client.manga.pages(source.id, chapterUrl, {
      branch: typeof branch === "string" ? branch : null,
    });
  } finally {
    client.close();
  }

  if (!pages.length) {
    printError("no pages to download");
    return 1;
  }
  const { saved, total } = await downloadCbz(pages, cbzPath);
  if (saved === 0) {
    printError("no pages could be downloaded");
    return 1;
  }
  if (globals.json) {
    printJson({ file: cbzPath, pages: saved, total });
  } else {
    print(`Saved ${saved}/${total} pages to ${cbzPath}`);
  }
  return 0;
}

async function cmdVersion(_argv: string[], globals: GlobalFlags): Promise<number> {
  const packageVersion = await readPackageVersion();
  if (globals.json) {
    printJson({ package: packageVersion });
    return 0;
  }
  print(`nyora ${packageVersion}`);
  return 0;
}

/** Read this package's version from its own `package.json`, best-effort. */
async function readPackageVersion(): Promise<string> {
  try {
    const { readFile } = await import("node:fs/promises");
    const here = path.dirname(fileURLToPath(import.meta.url));
    const pkgPath = path.join(here, "..", "package.json");
    const raw = await readFile(pkgPath, "utf8");
    const parsed = JSON.parse(raw) as { version?: string };
    return parsed.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

// --------------------------------------------------------------------------- //
// Dispatch
// --------------------------------------------------------------------------- //

type Handler = (argv: string[], globals: GlobalFlags) => Promise<number>;

const HANDLERS: Record<string, Handler> = {
  sources: cmdSources,
  search: cmdSearch,
  popular: cmdPopular,
  latest: cmdLatest,
  details: cmdDetails,
  pages: cmdPages,
  download: cmdDownload,
  version: cmdVersion,
};

const USAGE = `nyora-cli — independent Nyora SDK command-line interface

Usage:
  nyora-cli [--json] <command> [options]
  nyora-cli                         launch the interactive terminal reader (TUI)

Commands:
  sources [--search Q]              list or filter available sources
  search  -s SRC [-p N] <query>     search a source
  popular -s SRC [-p N]             list popular manga from a source
  latest  -s SRC [-p N]             list latest manga from a source
  details -s SRC <url>              fetch manga details and chapters
  pages   -s SRC [--branch B] <url> fetch chapter page image URLs
  download -s SRC [--branch B] [-o OUT] <url>
                                    download a chapter as a .cbz archive
  update  [--force]                 apply over-the-air parser updates
  serve   [--host H] [--port N]     run the helper-compatible REST server
  version                           show package and OTA versions

Global options:
  --json                            emit raw JSON instead of pretty output
  -h, --help                        show this help

-s/--source accepts a source id or a fuzzy name.
`;

/**
 * Run the `nyora-cli` command and return a numeric exit code.
 *
 * With **no subcommand** (an empty or flags-only `argv`) this launches the
 * interactive {@link module:tui | TUI} via its `run()` and returns its code.
 * Otherwise it dispatches the matching subcommand. Recognized errors are printed
 * as `error: ...` (no stack trace) and mapped to exit code `1`.
 *
 * @param argv - CLI arguments **excluding** `node` and the script path
 *   (i.e. `process.argv.slice(2)`).
 * @returns The process exit code.
 */
export async function main(argv: string[] = []): Promise<number> {
  // Split global flags (before the command) from the rest.
  const globals: GlobalFlags = { json: false };
  let index = 0;
  for (; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--json") {
      globals.json = true;
    } else if (token === "-h" || token === "--help") {
      process.stdout.write(USAGE);
      return 0;
    } else if (token === "--") {
      index += 1;
      break;
    } else if (token.startsWith("-")) {
      // Unknown global flag: leave it for the subcommand parser by stopping.
      break;
    } else {
      break;
    }
  }

  const command = argv[index];
  if (!command) {
    // Bare `nyora-cli` (no subcommand) launches the interactive TUI.
    const { run } = await import("./tui.js");
    return run();
  }

  const handler = HANDLERS[command];
  if (!handler) {
    printError(`unknown command: ${command}`);
    process.stderr.write(USAGE);
    return 2;
  }

  try {
    return await handler(argv.slice(index + 1), globals);
  } catch (err) {
    if (err instanceof CliError) {
      printError(err.message);
      return 1;
    }
    // Known SDK errors carry a clean message; everything else gets one too.
    printError(err instanceof Error ? err.message : String(err));
    return 1;
  }
}

// Execute only when run as a script, not when imported by tests.
// `process.argv[1]` may be a symlink (e.g. the `nyora-cli` bin that `npm i -g`
// creates), while `import.meta.url` is the resolved real file path, so compare
// both after resolving symlinks rather than matching the raw strings.
const invokedDirectly = (() => {
  const entry = process.argv[1];
  if (entry === undefined) return false;
  try {
    const self = fileURLToPath(import.meta.url);
    return realpathSync(self) === realpathSync(entry);
  } catch {
    return import.meta.url === pathToFileURL(entry).href;
  }
})();
if (invokedDirectly) {
  main(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((err: unknown) => {
      printError(err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
    });
}
