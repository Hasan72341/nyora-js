---
title: TUI
---

# Terminal reader (TUI)

`nyora-cli` ships an interactive **terminal reader** — a keyboard-driven flow for
browsing sources, searching, reading details, and listing a chapter's page image
URLs, all backed by the in-process [Nyora client](library.md) (no helper).

## Start it

Run `nyora-cli` with **no subcommand**:

```bash
nyora-cli
```

That's it — a bare invocation launches the TUI. Any subcommand (e.g.
`nyora-cli sources`) runs that command instead and never starts the reader.

## Flow

The reader walks a single linear flow, with `< back` choices at each step:

```text
pick a source  →  search / browse popular  →  pick a result
              →  view details + chapters    →  list a chapter's page URLs
```

Step by step:

1. **Filter sources.** Type a substring to filter the catalog (blank shows all,
   type `q` to quit), then pick a source from the matching list. Each row shows
   the name, language, an `(18+)` marker for NSFW sources, and the id.
2. **Browse / search.** The source opens on its **popular** list. Choose
   `[ search ]` to type a query, or use `[ next page ]` / `[ previous page ]` to
   page through results.
3. **Pick a result.** Selecting a manga loads its **details** — title, authors,
   state, tags, and description — followed by the full chapter list.
4. **Pick a chapter.** Selecting a chapter resolves and prints its **page image
   URLs** (numbered). Press **Enter** to go back to the chapter list.

## Navigation

| Choice / key | Action |
|---|---|
| Arrow keys + Enter | Move the selection and confirm (standard list prompt). |
| `[ search ]` | Type a new query (blank = popular) for the current source. |
| `[ next page ]` / `[ previous page ]` | Page through the current results. |
| `< back ...` | Step back one level (results → sources, chapters → results, …). |
| Type `q` at the source filter | Quit the reader. |
| `Ctrl+C` / `Ctrl+D` | Exit cleanly at any prompt (returns exit code `0`). |

Errors (a failed request, a parser hiccup) are shown as a one-line message and
the reader keeps going — it never crashes out of the flow. Thanks to the
runtime's tolerance, a blocked or empty source typically shows **"No results."**
rather than an error.

## Non-TTY behavior

The reader needs an interactive terminal (a TTY) to draw to and read keys from.
When stdout is **not** a TTY — piped, redirected, or under CI — running bare
`nyora-cli` does **not** start the prompts. Instead it prints a short notice and
exits `0`:

```text
Nyora terminal reader needs an interactive terminal (a TTY).
stdout is not a TTY here (piped, redirected, or non-interactive shell).
Run 'nyora-cli' directly in a terminal to use it.
For scripting, use subcommands instead, e.g. 'nyora-cli sources'.
```

So `nyora-cli | cat`, `nyora-cli > out.txt`, and CI pipelines never hang or
crash. For non-interactive use, reach for the [CLI subcommands](cli.md) (with
`--json`) instead.

## Tips

- The TUI is just a front-end over the same [`Nyora`](library.md) client — if a
  source works in the TUI, it works in the SDK and the CLI, and vice-versa.
- Run `nyora-cli update` first if a source looks stale; the reader uses whatever
  parser bundle is currently installed.
