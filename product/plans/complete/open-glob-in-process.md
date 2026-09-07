# Expand an `open` glob without shelling out through the user's login shell

**Complexity: 3/10** — one function's body is replaced with an in-process matcher and moves to its own module so it can be tested directly. Two source files and their tests; no command grammar change, no caller change, no change to the observable contract.

## Goal

Make `open *.png` list the same files on every host, and stop a pattern carrying a `;` from running whatever follows it.

## Approach

`expandGlob` builds a bash-shaped `for f in <pattern>; do printf '%s\n' "$f"; done` as a string, interpolates the user's pattern into it raw, and runs it through `SHELL_NAME` — which is `(process.env.SHELL || 'bash').split('/').pop()`, a constant that exists to label the `shell:<name>` connection row and to launch tab shells, now carrying a second and incompatible meaning as a glob interpreter.

Two things follow. On a host whose login shell is fish or csh, `for … do … done` is a syntax error, the empty output reads as an empty match set, and `open *.png` reports "no matching files" for a directory full of them. And because the pattern is interpolated into a shell command, `open 'a.png; rm -rf x'` runs the second command.

`shellStartupArgs` in `src/shell-startup.ts` shows the standard this file is held to — a per-shell table, and a documented answer for an unrecognized shell — precisely because shells disagree. The rest of the codebase spawns with argument arrays.

Node's own `fs.globSync` matches the process's own way on every host and covers exactly the metacharacter set `isGlobPattern` already advertises: `*`, `?`, `[…]`, and `{…}` brace expansion, all verified against the running Node. A pattern containing a shell metacharacter simply matches nothing, because nothing interprets it as a command. Brace expansion keeps working, so the command's error text needs no new caveat.

The observable contract `runOpenCommand` depends on is preserved exactly: absolute paths resolved against the tab's cwd, non-files dropped, duplicates removed, `localeCompare` ordering, and the `TabManager.OPEN_MAX_FILES` cap with its "Opening the first N of M" note still applied by the caller. A pattern matching only directories therefore yields nothing and reports "no matching files", as it does today.

The function moves to `src/open-glob.ts`. It uses no instance state, and the item asks for direct tests of each pattern form — which a private method cannot have. `SHELL_NAME` and `spawnSync` leave `open-file-manager.ts` with it, so that file no longer executes a shell at all.

## Implementation steps

1. Add `src/open-glob.ts` exporting `expandGlob(pattern, cwd)`: `globSync` under a try/catch returning `[]`, then the existing resolve/`isFile`/dedupe/sort pipeline unchanged.
2. In `src/open-file-manager.ts`, delegate to it and drop the `spawnSync` and `SHELL_NAME` imports.

## Tests

`src/open-glob.test.ts` is new, over a real temporary directory — `expandGlob` had no direct test at all, only the pipeline reaching it as a callback:

- Each pattern form `isGlobPattern` advertises: `*`, `?`, a character class, and brace expansion, including a brace inside an extension (`*.{png,jpg}`).
- Relative matches come back absolute, resolved against the given cwd, and a subdirectory pattern works.
- Directories are dropped, so a pattern matching only directories returns nothing.
- Results are sorted by `localeCompare` and de-duplicated.
- A pattern containing a shell metacharacter matches nothing **and executes nothing** — asserted by pointing it at a command that would leave a file behind, and checking the file was never created.
- A pattern matching nothing returns an empty list rather than throwing.

`src/commands/open.test.ts` covers `parseOpen` and `isGlobPattern` and is unaffected. `src/open-file-manager.test.ts` supplies `expandGlob` as a callback and must keep passing, including the over-cap case, which stays the caller's behaviour.

## Spec updates

`product/specs/open.md` — state that a glob is expanded by the application itself, so it behaves the same whatever login shell the user runs; that `*`, `?`, character classes, and brace expansion are supported; and that a pattern is never interpreted as a command, so one containing shell punctuation matches nothing.

## Docs

`documentation/user-documentation/tab-types/opening-files.md` said "the pattern expands exactly as your shell would expand it", which is no longer how it works; that paragraph is corrected in place, naming the supported forms and stating that a pattern is matched rather than run. `help.md` mentions wildcards only as "the same paths and wildcards as `open`" for `video` and `audio`, which stays true and needs no change.

## Out of scope

- `SHELL_NAME` itself, which keeps its real job of labelling the shell connection row and launching tab shells.
- The `isGlobPattern` character set, which is unchanged.
- `OPEN_MAX_FILES` and its "Opening the first N of M" note, which stay with the caller.
