---
title: TUI
---

# Terminal reader (TUI)

`nyora-cli` ships an interactive **terminal reader** — a keyboard-driven flow for
browsing sources, searching, reading details, and listing a chapter's page image
URLs, all backed by the [Nyora cloud client](library.md). It also folds in
**cloud sync**: sign in, favourite manga, and browse your synced library without
leaving the terminal.

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
   `q` quits). Two shortcuts are recognized here: type `sync` (or `account`) to
   open the **account menu**, or `lib` (or `library`) to open your **synced
   library**. Otherwise pick a source from the matching list. Each row shows the
   name, language, an `(18+)` marker for NSFW sources, and the id.
2. **Browse / search.** The source opens on its **popular** list. Choose
   `[ search ]` to type a query, or use `[ next page ]` / `[ previous page ]` to
   page through results.
3. **Pick a result.** Selecting a manga loads its **details** — title, authors,
   state, tags, and description — followed by the full chapter list. If you are
   signed in, the reader asks **"Favourite to library?"** before showing the
   chapters (see [sync](#sync)).
4. **Pick a chapter.** Selecting a chapter resolves and prints its **page image
   URLs** (numbered). Press **Enter** to go back to the chapter list.

## Navigation

| Choice / key | Action |
|---|---|
| Arrow keys + Enter | Move the selection and confirm (standard list prompt). |
| `[ search ]` | Type a new query (blank = popular) for the current source. |
| `[ next page ]` / `[ previous page ]` | Page through the current results. |
| `< back ...` | Step back one level (results → sources, chapters → results, …). |
| Type `sync` at the source filter | Open the account (sign in / out) menu. |
| Type `lib` at the source filter | Open the synced library. |
| Type `q` at the source filter | Quit the reader. |
| `Ctrl+C` / `Ctrl+D` | Exit cleanly at any prompt (returns exit code `0`). |

The source list also offers explicit **⚙ account (sync)** and **★ library**
choices, so you can reach them without typing the shortcut.

Errors (a failed request, a helper hiccup) are shown as a one-line message and
the reader keeps going — it never crashes out of the flow.

## Sync

The reader talks to the Nyora sync server through a {@link NyoraSync} client:

- **Account.** Type `sync` (or pick **⚙ account (sync)**). If you are signed out,
  it prompts for your email and password and signs you in; the tokens persist to
  `~/.config/nyora/sync.json`, so you stay signed in on the next run. If you are
  already signed in, it offers to sign out. The source filter prompt shows your
  email while signed in.
- **Favourite.** After opening a manga's details **while signed in**, the reader
  asks **"Favourite to library?"**. Confirming pushes the manga into your cloud
  library (`nyora_manga`) and marks it a favourite (`nyora_favourite`).
- **Library.** Type `lib` (or pick **★ library**) to list your synced favourites,
  each labelled with its source. Selecting one re-fetches its details from the
  cloud helper.

See the **[Sync guide](sync.md)** for the underlying `NyoraSync` API.

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

- The TUI is just a front-end over the same [`Nyora`](library.md) cloud client —
  if a source works in the TUI, it works in the SDK and the CLI, and vice-versa.
- Sync is optional: everything except the account/library/favourite features
  works fully without signing in.
