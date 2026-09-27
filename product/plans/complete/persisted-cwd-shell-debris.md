# Persist an agent's working directory as a path, so a relaunched agent gets a working shell

**Complexity: 4/10** — a one-line seed change in `src/shell/pty-session.ts`, a small answer-extraction helper in `src/shell/index.ts`, a directory check at the one place `ShellManager` hands a local shell its starting directory, and tests for each. No protocol, client, or persistence-format change.

## Bug

From `product/backlog/bugs.md` (first `## ready` entry): "Persist an agent's working directory as a path, so an agent brought back by relaunch gets a working shell". Under zsh, the `cwd` written to `.janissary/state/<name>.json` becomes a blob of the shell's raw terminal output rather than a directory, and a tab restored by `--relaunch` then cannot start a shell: every command ends `(shell exited)`.

## Reproduction

A throwaway script, `temp/repro-pwd.ts`, run with `npx tsx`, wraps a real `node-pty` shell in `createPtyShell` (exactly as `ShellManager.spawnPtyShellFor` does) and runs `echo one`, `echo two` and `echo three`, each followed by `queryShellPwd`, the same sequence `ShellManager.execute` runs.

- Under `/bin/zsh --no-rcs`: every pwd result is debris, for example after `echo one` it was `"one\r\n__JS_END_0_…__\r\n\u001b[1m\u001b[7m%\u001b[27m…\r \rpwd\r\necho \""`, and after `echo two` it held the previous command's tail, its sentinel, the inverse-video `%` partial-line marker, ZLE redraw escapes (`\u001b[?2004h`), the echoed `pwd`, the real path, and the start of the next `echo "` line. Command outputs were misaligned the same way: `echo one` returned ZLE redraw escapes and the echoed `{ :; echo one` rather than `one`.
- Under `/bin/bash --norc --noprofile`: every command returned its own output and every pwd returned the bare path.

`ShellManager.run` hands that pwd result to `TabManager.setCwd`, which stores it, and `buildAgentStateFromTab` persists it. On relaunch, `spawnPtyShellFor` passes it to `pty.spawn` as `cwd`, which is not a directory, so the shell exits at once.

## Root cause

1. `SEED_COMMAND` (`src/shell/pty-session.ts`) turns off tty echo with `stty -echo` and clears `PS1`/`PS2`. That quiets bash, but zsh's line editor (ZLE) does its own echo and redraws every input line it reads — including the line that carries the `__JS_END_…__`/`__PWD_…__` sentinel — and zsh prints its `PROMPT_SP` partial-line marker (`%` followed by padding and `\r`) before each prompt. The redrawn sentinel matches before the command has actually run, so each command's result and each pwd answer are cut from the wrong window of the stream.
2. `queryShellPwd` (`src/shell/index.ts`) returns everything before the marker, trimmed, with no check that it is a path. Whatever debris sits in that window becomes the tab's cwd.
3. `ShellManager.spawnFor`/`spawnPtyShellFor` (`src/shell/manager.ts`) start a local shell in the stored cwd without checking it is a directory, so one bad value kills every shell the tab will ever start.

## Correct behavior

Per `product/specs/history.md`, the persisted `cwd` is "the shell's working directory", and per `product/specs/shell.md` the pty shell is put into "a quiet state — echo off, empty prompts — so the terminal's own echo cannot appear in captured output" before any command runs. Under zsh as under bash, command output and the pwd answer contain only what the command and `pwd` printed, the stored `cwd` is a bare absolute path, and a local tab whose stored `cwd` is not a directory still gets a working shell (started in the project directory, after which the next pwd query repairs the stored value).

## Approach

- Extend the seed so zsh goes quiet too: when `$ZSH_VERSION` is set, also clear `PROMPT` and `RPROMPT` and `unsetopt zle prompt_cr prompt_sp`. Bash never enters the zsh branch and keeps its `PS1`/`PS2` handling. Verified with the reproduction script: under zsh all three commands then return `one`/`two`/`three` and every pwd is the bare path.
- Make `queryShellPwd` keep only the answer: the last line before the marker that, stripped of `\r` and surrounding whitespace, is an absolute path (starts with `/` and holds no control characters). A window with no such line yields `''`, which `ShellManager` already treats as nothing to report, leaving the previous cwd in place.
- In `ShellManager.spawnFor`, resolve a local shell's starting directory through a directory check: a stored cwd that is not an existing directory is dropped, so the shell starts in the project directory (`TabManager.launchDir`, where every new tab starts) — the pty shell is spawned there and the piped shell is `cd`'d there. `process.cwd()` is not used, because it is wherever the `janus` process happened to be started, which need not be the project. A tab with no recorded cwd at all is unchanged. Remote tabs are untouched: their cwd is a path on another machine.

## Implementation steps

1. `src/shell/pty-session.ts`: extend `SEED_COMMAND` with `[ -n "$ZSH_VERSION" ] && { PROMPT=''; RPROMPT=''; unsetopt zle prompt_cr prompt_sp; }`, with a comment saying why zsh needs more than bash.
2. `src/shell/pty-session.test.ts`: assert the seed clears `PROMPT` and `RPROMPT` and turns off `zle` under a `$ZSH_VERSION` guard.
3. `src/shell/index.ts`: add a `pwdAnswer(text)` helper that returns the last absolute-path line, with a comment naming the debris it skips, and have `queryShellPwd` use it.
4. `src/shell/index.test.ts`: add a case feeding `queryShellPwd` the PTY-shaped buffer from the reproduction (leftover output, a sentinel, the `%` marker with escapes, the echoed `pwd`, the path, the start of the next `echo "` line) and asserting the bare path; add a case for a path-less buffer yielding `''`.
5. `src/shell/manager.ts`: add a local `existingDirectory(cwd)` check, with a comment saying why a non-directory is dropped, and use it in `spawnFor` for the local branches.
6. `src/shell/manager.test.ts`: assert a pty shell whose tab cwd is not a directory is spawned in the project directory, a real directory is passed through, and a piped shell is `cd`'d into the project directory for a non-directory.
7. Run `./scripts/run.mjs check-diff` after each step.

## Regression test

- `src/shell/index.test.ts` — "keeps only the path when the answer arrives among terminal debris": fails today (the result is the whole blob), passes with the fix.
- `src/shell/pty-session.test.ts` — "quiets zsh's own prompts and line editor too": fails today (the seed has no `PROMPT`/`RPROMPT`/`zle`), passes with the fix.
- `src/shell/manager.test.ts` — "starts a local pty shell in the project directory when the tab's cwd is not a directory": fails today (the blob is passed to `spawnTransport`), passes with the fix.

## Verification in the app

Run against a scratch project under `SHELL=/bin/zsh` with `node bin/janus.mjs --no-open`, driven through the attached browser and then over the app's websocket. On `master`, `echo one` then `echo two` left the debris blob in `cwd`; after `--relaunch`, every command ended `(shell exited)` and `cwd` never repaired. With the fix, the transcript showed only `one`/`two`, the header showed `$root/`, `cwd` was the project path, and relative Tab completion worked. After `--relaunch`, `pwd` printed the saved directory, and `cd docs` was restored on the next relaunch. With a debris blob planted in the saved `cwd`, the relaunched tab's shell started in the project directory and the next pwd query repaired `cwd`. This check is what moved the fallback from `process.cwd()` to the project directory: the first stale-cwd run started the shell in the directory `janus` had been run from, which was not the project.

## Specs and docs

`product/specs/shell.md`: say the quiet state covers zsh's own line editor and prompt markers as well as echo and prompts, that the working directory recorded after a command is the shell's bare path, and that a local shell whose recorded directory no longer exists starts in the project directory. `help.md` and `documentation/user-documentation/` do not describe the pwd bookkeeping, so neither changes.

## Out of scope

- A directory check inside `TabManager.setCwd`: the same setter receives remote tabs' cwd (a path on another machine that cannot be checked locally) and file-navigator roots, so guarding it there would break remote tabs. The value is instead cleaned where it is produced (`queryShellPwd`) and checked where a local shell consumes it (`spawnFor`).
- Repairing already-persisted state files: a bad stored cwd now yields a shell in the project directory, and the first command's pwd query overwrites the stored value with a real path.
- Tab completion's use of the tab cwd (`src/completion/`): it is correct once the cwd is a path.
