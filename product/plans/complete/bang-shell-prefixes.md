# Add `!`/`!!` shorthand prefixes for explicit shell commands

**Complexity: 3/10** — a small addition to `resolveCommand`'s existing prefix handling, reusing the `shell`/`--pty` machinery that already exists end to end (persistent shell, PTY takeover, interactive detection). No new subsystems, no new message types, no web changes.

Typing a command into a tab either matches a built-in, or must be spelled `shell <cmd>` to run in the shell — anything else is sent through probabilistic recognition (shell / db / acp) or, if that is not confident, opens the route chooser. There is no way to say "run this in the shell" tersely, and no way to say "run this in the shell, in its own interactive PTY" at all without the longer `shell --pty <cmd>` form.

## Goal

A leading `!` on a typed command is shorthand for the `shell` keyword: `!ps` behaves exactly like `shell ps` — always routed to the shell, never sent through recognition. A leading `!!` is shorthand for `shell --pty`: `!!htop` behaves exactly like `shell --pty htop` — forced into an interactive PTY. A bare `!` behaves like a bare `shell` (empty shell command); a bare `!!` behaves like a bare `shell --pty` (opens a login shell in a PTY).

## Design decisions

**Handled entirely in `resolveCommand`, as two more explicit prefixes alongside `shell`.** `resolveCommand` already special-cases the `shell` keyword (and its `--pty` flag) before probabilistic recognition ever runs. `!`/`!!` become two more leading forms recognized at the very top of that function, resolving straight to the same `{ kind: 'shell', cmd, pty? }` shape the `shell` keyword produces. Nothing downstream (`CommandManager.run`, `runShell`, PTY takeover, interactive detection) needs to know the command arrived via `!` instead of `shell` — they only ever see the `Resolution`.

**Check `!!` before `!`.** Both are leading-character prefixes (not word-bounded, since `!` isn't a word character), so `!!htop`.startsWith('!') is also true. Checking the two-character form first avoids stripping only one `!` and leaving `!htop`.

**No word boundary needed.** The existing `shell` keyword match uses `\b` to avoid misfiring on `shellcheck`. `!` needs no such guard — nothing else begins with `!`, so `!ps` and `!!htop` are unambiguous.

**Whitespace after the prefix is optional and stripped.** `!ps`, `! ps`, and `!  ps` all resolve to `cmd: 'ps'`, matching how the `shell` keyword already strips one or more spaces after itself.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| The `shell`/`--pty` resolution this mirrors | `resolveCommand`, `src/resolve.ts:36-41` |
| PTY takeover and interactive auto-detection for the resulting `Resolution` | `CommandManager.run` / `runShell`, `src/command/manager.ts` |
| Existing prefix tests to model new ones on | `src/commands/resolve.test.ts` |
| The explicit-prefix framing in the spec | `product/specs/command-routing.md` ("An explicit prefix always wins") |
| The `--pty` forcing behavior being mirrored | `product/specs/shell.md`, "Forcing PTY mode with `--pty`" |

## Implementation steps

1. **`src/resolve.ts`.** Add two checks at the top of `resolveCommand`, immediately after the empty-input check and before the `shell` keyword check:
   - `trimmed.startsWith('!!')` → strip the two characters and any following whitespace, return `{ kind: 'shell', cmd: rest, pty: true }`.
   - `trimmed.startsWith('!')` → strip the character and any following whitespace, return `{ kind: 'shell', cmd: rest }`.
   Update the function's leading comment to mention `!`/`!!` as shorthand for `shell`/`shell --pty`.

2. **`product/specs/command-routing.md`.** Note in the intro and in "Notes" that `!` and `!!` are explicit prefixes equivalent to `shell` and `shell --pty`, so they also bypass recognition entirely.

3. **`product/specs/shell.md`.** Add a short subsection near "Forcing PTY mode with `--pty`" documenting `!<command>` as shorthand for `shell <command>` and `!!<command>` as shorthand for `shell --pty <command>`, including the bare-`!!` case opening a login shell in a PTY.

4. **`documentation/user-documentation/command-bar/shell.md`.** This page already documents the `shell ` prefix and `shell --pty`, so add the `!`/`!!` shorthand alongside each.

## Tests

`src/commands/resolve.test.ts`:

- `!ps` → `{ kind: 'shell', cmd: 'ps' }`.
- `! git status` (with a space) → `{ kind: 'shell', cmd: 'git status' }`.
- bare `!` → `{ kind: 'shell', cmd: '' }`.
- `!!htop` → `{ kind: 'shell', cmd: 'htop', pty: true }`.
- bare `!!` → `{ kind: 'shell', cmd: '', pty: true }`.
- `!!  vim file.ts` (extra space) → `{ kind: 'shell', cmd: 'vim file.ts', pty: true }`.

## Out of scope

- Any change to the `shell` keyword itself, or to `--pty`'s existing behavior — `!`/`!!` are pure sugar for forms that already work.
- Recognizers (`src/recognizers/*`) and the route chooser — `!`/`!!` never reach them, same as the existing `shell` keyword.
- `help.md` — it does not currently document the `shell` keyword prefix at all (that command has no row in its built-ins table), so there is nothing documented for `!`/`!!` to correct; adding new documentation for previously-undocumented behavior is out of scope for this task.
- Any bash-style history-expansion meaning of `!` (e.g. `!!` re-running the last command) — this is Janissary's own command line, not a real shell, and no such behavior exists here to conflict with.
