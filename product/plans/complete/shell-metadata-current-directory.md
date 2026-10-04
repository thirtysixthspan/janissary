# Track the shell's current directory in metadata

**Complexity: 5/10** — the shell already reports prompt state through xterm OSC handlers; extend that path through one new plugin intent and test the OSC parsing and payload update.

## Goal

Keep the shell tab's metadata path synchronized with the directory zsh is currently in.

## Approach

Have zsh emit its current directory through OSC 7 at prompt time and after `cd`. Parse that signal in the terminal hook, send the decoded path through a shell plugin intent, and update the server-owned shell payload. The metadata row will continue rendering the payload's authoritative `cwd`. Keep the client component under the file-size limit by extracting its small intent-reporting function.

## Implementation steps

1. Emit OSC 7 from the shell integration hooks and parse it into a current-directory callback.
2. Add a guarded shell intent that updates the shell payload's `cwd`.
3. Connect the callback in the shell tab through a focused helper and test OSC parsing, intent dispatch, and metadata rendering.
4. Update the shell-tab spec to describe live directory tracking.

## Documentation

Update the shell command guide's existing description of the shell metadata row to say that its directory follows `cd`.

## Tests

Extend `web/src/plugins/shell/useShellTerminal.test.ts`, `web/src/plugins/shell/ShellTab.test.tsx`, and `src/plugins/shell/activate.test.ts` for prompt directory updates. Run diff-scoped checks after each implementation step.

## Out of scope

- Rewriting the user's zsh prompt.
- Changing which directories a shell may enter.
