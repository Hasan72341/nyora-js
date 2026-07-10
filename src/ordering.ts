/**
 * Order-independent chapter navigation.
 *
 * Source chapter arrays are **not** in a consistent order: some sources list
 * chapters oldest-first (ascending, e.g. MangaDex `0 -> N`) while many
 * scanlation sites list them newest-first (descending, `N -> 0`). A fixed
 * `index + 1` "next chapter" therefore moves the *wrong* way on half of all
 * sources.
 *
 * These helpers detect the reading direction from the chapter numbers so that
 * "next" is always the later (higher-numbered) chapter, regardless of how the
 * source ordered the array. This mirrors the fix already shipped in the Nyora
 * web and Android readers.
 *
 * @packageDocumentation
 */

import type { MangaChapter } from "./types.js";

/**
 * The index step that moves to the *next* (later) chapter.
 *
 * Compares the first and last chapter numbers: `+1` when the array is ascending
 * (oldest-first), `-1` when descending (newest-first). Falls back to `+1`
 * (assume oldest-first) when the direction is ambiguous.
 */
export function chapterReadingDelta(chapters: MangaChapter[]): 1 | -1 {
  if (chapters.length < 2) return 1;
  const first = chapters[0]?.number;
  const last = chapters[chapters.length - 1]?.number;
  if (Number.isFinite(first) && Number.isFinite(last) && first !== last) {
    return first < last ? 1 : -1;
  }
  return 1;
}

/** Return the chapters in canonical reading order (earliest first). */
export function readingOrder(chapters: MangaChapter[]): MangaChapter[] {
  return chapterReadingDelta(chapters) === 1 ? [...chapters] : [...chapters].reverse();
}

/** Locate `current` within `chapters` by identity, then id, then url. */
function indexOfChapter(chapters: MangaChapter[], current: MangaChapter): number {
  const byRef = chapters.indexOf(current);
  if (byRef >= 0) return byRef;
  return chapters.findIndex(
    (c) => (current.id && c.id === current.id) || (current.url && c.url === current.url),
  );
}

/**
 * The chapter `reading` steps from `current` in reading order.
 *
 * @param chapters - The manga's chapter list, in whatever order the source gave.
 * @param current - The chapter currently being read.
 * @param reading - `+1` for the next (later) chapter, `-1` for the previous.
 * @returns The neighbouring chapter, or `null` at either end / if not found.
 */
export function adjacentChapter(
  chapters: MangaChapter[],
  current: MangaChapter,
  reading: 1 | -1,
): MangaChapter | null {
  const i = indexOfChapter(chapters, current);
  if (i < 0) return null;
  const target = i + reading * chapterReadingDelta(chapters);
  return target >= 0 && target < chapters.length ? chapters[target]! : null;
}

/** The next (later) chapter after `current`, or `null`. */
export function nextChapter(chapters: MangaChapter[], current: MangaChapter): MangaChapter | null {
  return adjacentChapter(chapters, current, 1);
}

/** The previous (earlier) chapter before `current`, or `null`. */
export function previousChapter(
  chapters: MangaChapter[],
  current: MangaChapter,
): MangaChapter | null {
  return adjacentChapter(chapters, current, -1);
}
