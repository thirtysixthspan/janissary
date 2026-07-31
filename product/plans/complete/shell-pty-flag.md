# Add a `--pty` flag to the `shell` command to force an interactive PTY terminal

**Complexity: 3/10** — extends the existing `shell` keyword parser and the existing PTY routing branch in `CommandManager`; no new subsystems. The PTY, sandboxing, and inline-terminal-card machinery already exist and are reused unchanged.

## Goal

`shell <cmd>` already auto-detects certain known interactive programs (`vim`, `less`, `ssh`, `python`, …) via `isInteractive` (`src/interactive.ts`) and opens them in a full-tab PTY instead of the piped shell. There is no way to force PTY mode for a command `isInteractive` doesn't recognize, and no way to open a plain interactive shell prompt (a bare `shell` with no PTY-recognized command currently just runs an empty command in the piped shell and does nothing useful). Add a `--pty` flag to the `shell` command that forces PTY routing regardless of auto-detection, and — with no command after it — opens an interactive login shell in a PTY.

## Approach

`resolveCommand` (`src/resolve.ts`) already special-cases the `shell` keyword and strips it, returning `{ kind: 'shell', cmd }`. Extend this to also recognize a leading `--pty` token in the remainder, stripping it too and setting a new optional `pty: true` field on the `shell` resolution (omitted, not `false`, when absent, so existing `toEqual` assertions in `src/commands/resolve.test.ts` that don't mention `pty` keep passing).

`CommandManager.run`'s `'shell'` case (`src/command/manager.ts:85`) currently opens a PTY only when `isInteractive(res.cmd)` is true. Change the condition to `res.pty || (res.cmd && isInteractive(res.cmd))`. When `res.pty` is set and `res.cmd` is empty, there's no program to run — fall back to the user's login shell (`process.env.SHELL || 'bash'`) as both the command and the display program name (basename). `pty.ts`'s `spawnPty` already runs `<shell> -lc <command>`; handing it a bare shell path as `command` (e.g. `bash -lc "/bin/zsh"`) execs that shell attached to the PTY with no `-c` of its own, so it starts interactively (it sees a tty on stdin) — no change needed in `pty.ts` or `pseudoterminal-manager.ts`.

## Implementation steps

1. `src/resolve.ts`: add `pty?: boolean` to the `shell` variant of `Resolution`. In the `shell` branch, after stripping the `shell` keyword, check the remainder for a leading `--pty` token (`/^--pty\b\s*/`); if present, strip it and set `pty: true` on the returned object, else return the object without a `pty` key at all.
2. `src/command/manager.ts`: in the `'shell'` case, change the PTY-routing condition to `res.pty || (res.cmd && isInteractive(res.cmd))`. When routing to PTY, compute `command` as `res.cmd || (process.env.SHELL || 'bash')` and `program` as the first whitespace-delimited token of `res.cmd`, or the basename of the fallback shell path when `res.cmd` is empty.

## Tests

- `src/commands/resolve.test.ts`: add cases —
  - `resolveCommand('shell --pty vim file.ts')` → `{ kind: 'shell', cmd: 'vim file.ts', pty: true }`.
  - `resolveCommand('shell --pty')` → `{ kind: 'shell', cmd: '', pty: true }`.
  - `resolveCommand('shell --pty  echo hi')` (extra whitespace) strips cleanly to `cmd: 'echo hi'`.
- `src/command/manager.test.ts`: add cases —
  - `shell --pty echo hi` calls `managers.pty.openInlinePty` with `('janus', 'echo hi', 'echo')`, not `managers.shell.run`.
  - Bare `shell --pty` calls `managers.pty.openInlinePty` with the fallback shell command/program (stub `process.env.SHELL` for a deterministic program name in the test, or assert against the basename of whatever `SHELL`/`bash` resolves to).

Run `./scripts/run.mjs check-diff` after each step.

## Spec updates

- `product/specs/shell.md`: the "Interactive PTY takeover" section describes only the auto-detection trigger. Note the `--pty` flag as an additional trigger, and add a subsection documenting the flag's behavior (forces PTY mode for any command; a bare `shell --pty` opens the login shell in a PTY).

## Docs

- `documentation/user-documentation/command-bar/shell.md`: the "Interactive programs take over the tab" section (line 43) describes only the auto-detection path. Add a short note documenting the `--pty` flag as the explicit escape hatch, alongside the existing `shell ` keyword description at line 15-21.

## Out of scope

- Changing `isInteractive`'s auto-detection list — unaffected, still used for the non-flag path.
- Any change to `pty.ts` / `pseudoterminal-manager.ts` internals — the existing `spawnPty`/`openInlinePty` plumbing already supports this without modification.
- Adding a matching flag to any other command.
