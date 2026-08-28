# Fix a promoted interactive command never ending — its delimiter is eaten as input

**Complexity: 4/10** — a one-line change to how a command and its end-of-output delimiter are written to the shell, plus tests. No new architecture: the promotion, busy, and transcript machinery already do the right thing once the delimiter arrives.

## Goal

A shell command promoted to a full-tab terminal (`Ctrl+O`, the **open in terminal** action on the running entry, or automatic detection) must end when the program ends: the terminal closes, the transcript comes back with `(ran in terminal)`, and the agent stops being busy so the next command can run.

Today it does not. When the promoted program exits, the terminal stays open showing the tab's shell sitting at an empty prompt waiting for input, and the agent stays busy forever.

## Background (verified)

- `src/shell.ts`'s `executeShellCmd` writes the command and its end-of-output delimiter as **two separate lines** in a single write: `` `${command} 2>&1\necho "${prompt}"\n` ``. Completion is detected by finding `prompt` (`__JS_END_<tab>_<timestamp>__`) in the output.
- Both `bash` and `zsh` read a non-seekable stdin (a pipe, or the tab shell's pty) **one line at a time**, precisely so that whatever follows stays available to the command they are about to run. So at the moment the command starts, the line `echo "__JS_END_…__"` is still sitting unread in the shell's input.
- A command that reads its own stdin therefore consumes the delimiter line as **its own input**. Verified directly:
  ```
  $ printf 'read -r LINE 2>&1\necho "__JS_END_1__"\necho "LINE=[$LINE]"\n' | bash --noprofile --norc
  LINE=[echo "__JS_END_1__"]
  ```
  The delimiter is never printed.
- Those are exactly the commands that get promoted. `product/specs/shell.md` describes the manual promotion as covering "a password prompt, a `read`, a bare REPL", and detection promotes full-screen programs, which read the terminal in raw mode and swallow the pending line as keystrokes.
- With the delimiter gone, `executeShellCmd`'s `onComplete` never fires, so `ShellManager.run`'s `onDone` never runs: `promotion.finish()` never clears `tab.activePty` (the terminal stays up), `update(…, false)` never runs (`deleteBusy` never happens, the entry stays `running`), and the tab's shell — echo off, `PS1` empty — sits at a blank prompt in the still-open terminal. That is the reported symptom exactly.
- Everything downstream of the delimiter is already correct: `src/shell-promotion.ts`'s `finish()` clears `activePty`, and `ShellManager.run` finalizes the entry as `(ran in terminal)` and drops the busy marker. Tests in `src/shell-manager.test.ts` already pin that behavior with a mocked `executeShellCmd`, which is why the bug is invisible to the current suite — the mock always delivers completion.
- The same swallowing affects the piped local shell and the remote shell, since all three go through `executeShellCmd`.

## Approach

Write the command and its delimiter as **one logical line**, so the shell must read all of it before it can run anything and nothing is left in the input for the command to consume:

```
{ :; <command>
} 2>&1; echo "<delimiter>"
```

The brace group is read to its closing `}`, and the `; echo "<delimiter>"` that follows on that same line is read with it. The group runs in the current shell, so `cd`, variable assignments, and exit status behave exactly as before, and `2>&1` on the group merges stderr for the whole command as it always did.

The leading `:;` is a guard: a command that is empty or nothing but a comment would otherwise make the group a syntax error, and a syntax error on that line would take the delimiter's `echo` down with it — reintroducing the same hang for a different reason.

Verified in both `bash` and `zsh` (the two shells with startup flags of their own) against: a command that reads stdin, `cd` persistence, a failing command's stderr, a loop, a trailing comment, a backgrounded command, an empty command, and a comment-only command.

## Implementation

1. **`src/shell.ts`** — extract the write into a small pure helper next to `executeShellCmd`, and use it there:
   ```ts
   export function shellCommandInput(command: string, delimiter: string): string {
     return `{ :; ${command}\n} 2>&1; echo "${delimiter}"\n`;
   }
   ```
   With a comment recording *why* it is one logical line: written as two lines, a command that reads stdin consumes the delimiter and never ends.
2. **`src/remote/shell-session.ts`** — its header comment describes the write format (`executeShellCmd` appends `2>&1`); update the wording so it still matches the code. No behavior change.

## Tests

**`src/shell.test.ts`** (server project, runs under `check-diff`):

- `shellCommandInput` — returns a single logical line: everything after the first newline is the group's closing `} 2>&1; echo "<delimiter>"`, so no line of the input can be read as command input.
- `shellCommandInput` — an empty command still produces a runnable line that ends in the delimiter's `echo`.
- `executeShellCmd` — the existing "writes the command to stdin" case, updated to the new shape, still carrying the command text and the `__JS_END_<tab>_` delimiter.

**`src/shell.unsandboxed.test.ts`** (real child shell; run with `npm run test:unsandboxed`):

- Its local `runCommand` helper currently re-implements the two-line write. Rewrite it to call the real `executeShellCmd`, so the file tests the shipped format rather than a copy of it.
- New case: a command that reads a line from stdin (`read -r LINE`) completes — the delimiter arrives instead of being consumed as that command's input. This is the regression test for the reported bug, and it fails against the old two-line write.

## Spec

`product/specs/shell.md` — the "Shell command execution" section claims the command is wrapped as `(${cmd}) 2>&1`, which the code has not done for some time. Correct it to describe the current behavior: the command and its delimiter are written as one logical line so that a command reading its own stdin cannot consume the delimiter, and note under interactive promotion that a promoted command ends normally when its program exits.

## Out of scope

- `queryShellPwd`'s two-line write — it runs only `pwd`, which never reads stdin, and only after a command has completed.
- The `--pty` / recognized-interactive path, which spawns its own PTY and never goes through `executeShellCmd`.
- Exit-code propagation, and the `$?` a user sees for the command before last — unchanged, and already clobbered by the delimiter's own `echo` before this change.
- The promotion, busy, and transcript machinery in `src/shell-promotion.ts` and `src/shell-manager.ts` — already correct once the delimiter arrives.
