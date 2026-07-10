/**
 * Interactive terminal reader for Nyora's embedded parser runtime.
 *
 * Drives a single navigation flow built on `@inquirer/prompts`:
 * pick a source -> search or browse popular -> choose a result -> view details
 * and chapters -> list a chapter's page image URLs. Every step is backed by the
 * in-process {@link Nyora} client (no JVM helper), and network/parse errors are
 * surfaced as messages rather than crashing the UI.
 *
 * Non-TTY safety: when `process.stdout.isTTY` is false (piped, redirected, or
 * CI), the interactive UI is **not** started — a short friendly notice is
 * printed and {@link run} returns `0`.
 *
 * @packageDocumentation
 */

import { Nyora } from "./client.js";
import { nextChapter, previousChapter } from "./ordering.js";
import { NyoraSync } from "./sync.js";
import type { Manga, MangaChapter, MangaDetails, SearchPage, Source } from "./types.js";

/** A control sentinel returned by the choice prompts. */
const BACK = Symbol("back");
const QUIT = Symbol("quit");
const SEARCH = Symbol("search");
const NEXT = Symbol("next");
const PREV = Symbol("prev");
const ACCOUNT = Symbol("account");
const LIBRARY = Symbol("library");

/** Push `manga` to the cloud library and favourite it. */
async function favourite(sync: NyoraSync, sourceId: string, manga: Manga): Promise<void> {
  const now = new Date().toISOString();
  const id = manga.url;
  await sync.upsert("nyora_manga", [
    {
      id,
      title: manga.title,
      url: id,
      public_url: manga.url,
      cover_url: manga.coverUrl ?? "",
      authors: JSON.stringify(manga.authors ?? []),
      description: manga.description ?? "",
      source_ref: JSON.stringify({ source: sourceId }),
      updated_at: now,
    },
  ]);
  await sync.upsert("nyora_favourite", [
    { manga_id: id, added_at: now, sort_key: 0, updated_at: now },
  ]);
}

/** Pull the synced favourites joined with their manga metadata. */
async function pullLibrary(
  sync: NyoraSync,
): Promise<{ id: string; title: string; url: string; source: string }[]> {
  const favs = (await sync.select("nyora_favourite")).filter((f) => !f.deleted_at);
  const manga = new Map((await sync.select("nyora_manga")).map((m) => [m.id as string, m]));
  return favs.map((f) => {
    const meta = manga.get(f.manga_id as string) ?? {};
    let source = "";
    try {
      source = JSON.parse(String(meta.source_ref ?? "{}")).source ?? "";
    } catch {
      /* ignore */
    }
    return {
      id: String(f.manga_id ?? ""),
      title: String(meta.title ?? f.manga_id ?? ""),
      url: String(meta.url ?? f.manga_id ?? ""),
      source,
    };
  });
}

/**
 * Whether an interactive terminal is attached.
 *
 * The reader needs a TTY to draw to and read keystrokes from. When stdout is
 * redirected to a pipe/file (`process.stdout.isTTY` falsy) — as under CI or
 * `nyora-cli | cat` — starting the prompts would crash, so callers print a
 * notice and exit cleanly instead.
 *
 * @returns `true` only when both stdout and stdin look like a real TTY.
 */
export function hasInteractiveTerminal(): boolean {
  try {
    if (!process.stdout || !process.stdout.isTTY) return false;
    if (process.stdin && process.stdin.isTTY === false) return false;
    return true;
  } catch {
    return false;
  }
}

/** Print the notice shown when no interactive terminal is available. */
function printNoTtyNotice(): void {
  process.stdout.write(
    [
      "Nyora terminal reader needs an interactive terminal (a TTY).",
      "stdout is not a TTY here (piped, redirected, or non-interactive shell).",
      "Run 'nyora-cli' directly in a terminal to use it.",
      "For scripting, use subcommands instead, e.g. 'nyora-cli sources'.",
      "",
    ].join("\n"),
  );
}

/** Run `fn`, returning `[result, null]` or `[null, message]` (never throws). */
async function safe<T>(fn: () => Promise<T> | T): Promise<[T | null, string | null]> {
  try {
    return [await fn(), null];
  } catch (err) {
    const name = err instanceof Error ? err.constructor.name : "Error";
    const message = err instanceof Error ? err.message : String(err);
    return [null, `${name}: ${message}`];
  }
}

/** Lexicographically sort sources by display name (then id). */
function sortSources(sources: Source[]): Source[] {
  return [...sources].sort((a, b) =>
    (a.name || a.id).toLowerCase().localeCompare((b.name || b.id).toLowerCase()),
  );
}

/** Case-insensitive substring filter over source id/name. */
function filterSources(sources: Source[], query: string): Source[] {
  const needle = query.toLowerCase().trim();
  if (!needle) return sources;
  return sources.filter(
    (s) => s.id.toLowerCase().includes(needle) || s.name.toLowerCase().includes(needle),
  );
}

/** Short comma-joined tag summary for a manga listing row. */
function tagSummary(manga: Manga, limit = 3): string {
  return manga.tags
    .slice(0, limit)
    .map((tag) => String(tag.title ?? tag.name ?? ""))
    .filter(Boolean)
    .join(", ");
}

/**
 * Run the interactive terminal reader.
 *
 * Safe to call from a non-interactive context: when no TTY is attached it prints
 * a notice and returns `0` without starting any prompt. Otherwise it walks the
 * source -> results -> details -> pages flow until the user quits.
 *
 * @returns The exit code (`0` on a clean exit or non-TTY).
 */
export async function run(): Promise<number> {
  if (!hasInteractiveTerminal()) {
    printNoTtyNotice();
    return 0;
  }

  // Imported lazily so a non-TTY caller never loads the prompt library.
  const prompts = await import("@inquirer/prompts");
  const client = new Nyora();
  const sync = new NyoraSync();
  try {
    process.stdout.write("Nyora terminal reader — Nyora cloud sources\n\n");
    const [loaded, err] = await safe(() => client.sources.list());
    if (err || !loaded) {
      process.stdout.write(`Failed to load sources: ${err ?? "unknown error"}\n`);
      return 1;
    }
    const sources = sortSources(loaded);

    // Source loop.
    for (;;) {
      const source = await pickSource(prompts, sources, sync);
      if (source === QUIT) return 0;
      if (source === BACK) continue;
      if (source === ACCOUNT) {
        await account(prompts, sync);
        continue;
      }
      if (source === LIBRARY) {
        await library(prompts, client, sync);
        continue;
      }
      await browse(prompts, client, source, sync);
    }
  } catch (err) {
    // ExitPromptError (Ctrl+C / Ctrl+D) and friends end the session cleanly.
    if (isAbort(err)) {
      process.stdout.write("\n");
      return 0;
    }
    process.stdout.write(`\n${err instanceof Error ? err.message : String(err)}\n`);
    return 1;
  } finally {
    client.close();
  }
}

/** Whether a thrown value is an inquirer abort (Ctrl+C/Ctrl+D). */
function isAbort(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return err.name === "ExitPromptError" || err.name === "AbortPromptError";
}

type Prompts = typeof import("@inquirer/prompts");

type SourceChoice = Source | typeof BACK | typeof QUIT | typeof ACCOUNT | typeof LIBRARY;

/** Prompt for a source: filter by text, then choose from the matches. */
async function pickSource(
  prompts: Prompts,
  sources: Source[],
  sync: NyoraSync,
): Promise<SourceChoice> {
  const who = sync.isSignedIn ? ` (${sync.email})` : "";
  const query = await prompts.input({
    message: `Filter sources${who} (blank = all, 'sync'/'lib', 'q' quit):`,
  });
  const q = query.trim().toLowerCase();
  if (q === "q") return QUIT;
  if (q === "sync" || q === "account") return ACCOUNT;
  if (q === "lib" || q === "library") return LIBRARY;
  const matches = filterSources(sources, query);
  if (!matches.length) {
    process.stdout.write("No sources matched.\n");
    return BACK;
  }
  const choice = await prompts.select<SourceChoice>({
    message: "Pick a source",
    pageSize: 15,
    choices: [
      ...matches.slice(0, 200).map((s) => ({
        name: `${s.name}${s.lang ? ` [${s.lang}]` : ""}${s.isNsfw ? " (18+)" : ""}  ${s.id}`,
        value: s as SourceChoice,
      })),
      { name: "⚙ account (sync)", value: ACCOUNT },
      { name: "★ library", value: LIBRARY },
      { name: "< back to filter", value: BACK },
      { name: "quit", value: QUIT },
    ],
  });
  return choice;
}

/** Sign in/out of Nyora cloud sync. */
async function account(prompts: Prompts, sync: NyoraSync): Promise<void> {
  if (sync.isSignedIn) {
    const out = await prompts.confirm({ message: `Signed in as ${sync.email}. Sign out?`, default: false });
    if (out) {
      sync.signOut();
      process.stdout.write("Signed out.\n");
    }
    return;
  }
  const email = (await prompts.input({ message: "Email (blank to cancel):" })).trim();
  if (!email) return;
  const password = await prompts.password({ message: "Password:" });
  const [, err] = await safe(() => sync.signIn(email, password));
  process.stdout.write(err ? `Sign-in failed: ${err}\n` : `Signed in as ${sync.email}.\n`);
}

/** Browse the synced favourites library. */
async function library(prompts: Prompts, client: Nyora, sync: NyoraSync): Promise<void> {
  if (!sync.isSignedIn) {
    process.stdout.write("Sign in first ('sync').\n");
    return;
  }
  const [items, err] = await safe(() => pullLibrary(sync));
  if (err || !items) {
    process.stdout.write(`Failed to load library: ${err ?? "unknown error"}\n`);
    return;
  }
  if (!items.length) {
    process.stdout.write("Library is empty. Favourite manga from details.\n");
    return;
  }
  for (;;) {
    const choice = await prompts.select<(typeof items)[number] | typeof BACK>({
      message: `Library (${items.length})`,
      pageSize: 15,
      choices: [
        ...items.map((it) => ({ name: `${it.title}  [${it.source || "?"}]`, value: it })),
        { name: "< back", value: BACK },
      ],
    });
    if (choice === BACK) return;
    const [details] = await safe<MangaDetails>(() => client.manga.details(choice.source, choice.url));
    if (details) {
      process.stdout.write(`\n=== ${details.manga.title} === (${details.chapters.length} chapters)\n`);
    }
  }
}

/** Results loop for one source: search/popular, paging, and selection. */
async function browse(prompts: Prompts, client: Nyora, source: Source, sync: NyoraSync): Promise<void> {
  let query = "";
  let page = 1;

  for (;;) {
    const [result, err] = await safe<SearchPage>(() =>
      query.trim()
        ? client.manga.search(source.id, query.trim(), page)
        : client.manga.popular(source.id, page),
    );
    if (err || !result) {
      process.stdout.write(`Error loading results: ${err ?? "unknown error"}\n`);
      const retry = await prompts.input({
        message: "Search query (blank = popular, 'b' = back):",
      });
      if (retry.trim().toLowerCase() === "b") return;
      query = retry;
      page = 1;
      continue;
    }

    const mode = query.trim() ? `search:${query.trim()}` : "popular";
    process.stdout.write(`\n${source.name} — ${mode} — page ${page}\n`);
    if (!result.entries.length) process.stdout.write("No results.\n");

    const picked = await pickResult(prompts, result, page);
    if (picked === BACK) return;
    if (picked === SEARCH) {
      query = await prompts.input({ message: "Search (blank = popular):" });
      page = 1;
      continue;
    }
    if (picked === NEXT) {
      page += 1;
      continue;
    }
    if (picked === PREV) {
      page = Math.max(1, page - 1);
      continue;
    }
    await showDetails(prompts, client, source, picked, sync);
  }
}

/** Prompt to choose a manga from a results page (with paging controls). */
async function pickResult(
  prompts: Prompts,
  result: SearchPage,
  page: number,
): Promise<Manga | typeof BACK | typeof SEARCH | typeof NEXT | typeof PREV> {
  type Choice = Manga | typeof BACK | typeof SEARCH | typeof NEXT | typeof PREV;
  const choices: Array<{ name: string; value: Choice }> = result.entries
    .slice(0, 60)
    .map((manga) => {
      const tags = tagSummary(manga);
      return {
        name: `${manga.title}${tags ? `  (${tags})` : ""}`,
        value: manga as Choice,
      };
    });
  choices.push({ name: "[ search ]", value: SEARCH });
  if (result.hasNextPage) choices.push({ name: "[ next page ]", value: NEXT });
  if (page > 1) choices.push({ name: "[ previous page ]", value: PREV });
  choices.push({ name: "< back to sources", value: BACK });

  return prompts.select<Choice>({ message: "Pick a manga", pageSize: 15, choices });
}

/** Show details and a chapter list, then loop on chapter -> pages. */
async function showDetails(
  prompts: Prompts,
  client: Nyora,
  source: Source,
  manga: Manga,
  sync: NyoraSync,
): Promise<void> {
  const [details, err] = await safe<MangaDetails>(() =>
    client.manga.details(source.id, manga.url, { title: manga.title }),
  );
  if (err || !details) {
    process.stdout.write(`Failed to load details: ${err ?? "unknown error"}\n`);
    return;
  }
  const m = details.manga;
  process.stdout.write(`\n=== ${m.title} ===\n`);
  process.stdout.write(`Authors: ${m.authors.length ? m.authors.join(", ") : "Unknown"}\n`);
  process.stdout.write(`State: ${m.state ?? "n/a"}\n`);
  const tags = m.tags
    .map((t) => String(t.title ?? t.name ?? ""))
    .filter(Boolean)
    .join(", ");
  if (tags) process.stdout.write(`Tags: ${tags}\n`);
  process.stdout.write(`\n${m.description || "(no description)"}\n`);

  if (sync.isSignedIn) {
    const fav = await prompts.confirm({ message: "Favourite to library?", default: false });
    if (fav) {
      const [, ferr] = await safe(() => favourite(sync, source.id, m));
      process.stdout.write(ferr ? `Sync failed: ${ferr}\n` : "Added to library.\n");
    }
  }

  if (!details.chapters.length) {
    process.stdout.write("No chapters found.\n");
    return;
  }

  // Chapter loop.
  for (;;) {
    const choice = await prompts.select<MangaChapter | typeof BACK>({
      message: `Pick a chapter (${details.chapters.length})`,
      pageSize: 15,
      choices: [
        ...details.chapters.map((c) => ({
          name: `${c.title || c.id}${c.branch ? ` <${c.branch}>` : ""}`,
          value: c as MangaChapter | typeof BACK,
        })),
        { name: "< back to results", value: BACK },
      ],
    });
    if (choice === BACK) return;
    // Reading a chapter can hand back the next/previous chapter (order-independent)
    // so the reader flows on without bouncing back to the chapter list.
    let chapter: MangaChapter | null = choice;
    while (chapter !== null) {
      chapter = await showPages(prompts, client, source, chapter, details);
    }
  }
}

/**
 * Resolve and print a chapter's page image URLs, then offer to move to the
 * next/previous chapter. Returns the chosen neighbouring chapter to keep
 * reading, or `null` to return to the chapter list.
 */
async function showPages(
  prompts: Prompts,
  client: Nyora,
  source: Source,
  chapter: MangaChapter,
  details: MangaDetails,
): Promise<MangaChapter | null> {
  const [pages, err] = await safe(() =>
    client.manga.pages(source.id, chapter.url, { branch: chapter.branch }),
  );
  if (err || !pages) {
    process.stdout.write(`Failed to load pages: ${err ?? "unknown error"}\n`);
    return null;
  }
  process.stdout.write(`\n${chapter.title || chapter.id} — ${pages.length} pages\n`);
  pages.forEach((p, i) => {
    process.stdout.write(`${String(i + 1).padStart(3)}. ${p.url}\n`);
  });

  // Neighbours are resolved order-independently, so "next" is always the later
  // chapter regardless of whether the source sorted ascending or descending.
  const nxt = nextChapter(details.chapters, chapter);
  const prv = previousChapter(details.chapters, chapter);
  const choices: { name: string; value: MangaChapter | typeof BACK }[] = [];
  if (nxt) choices.push({ name: "next chapter >", value: nxt });
  if (prv) choices.push({ name: "< previous chapter", value: prv });
  choices.push({ name: "< back to chapters", value: BACK });
  const choice = await prompts.select<MangaChapter | typeof BACK>({
    message: "Continue reading",
    choices,
  });
  return choice === BACK ? null : choice;
}
