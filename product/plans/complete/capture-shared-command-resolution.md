# Route agent-message commands through the command bar's resolver

## Complexity

5/10. The change is confined to `CaptureManager` in `src/capture/manager.ts`, its unknown-command tail in `src/capture/router.ts`, the command bar's unknown-command tail in `src/command/router.ts`, a new shared helper in `src/route-choice.ts`, an optional hook on the `Command` type in `src/commands/types.ts` implemented by `src/commands/acp.ts` and `src/commands/browser.ts`, and tests. No wire, protocol, or command-syntax changes.

## Goal

`CaptureManager.run` serves `msg … command` and `msg … request`. It classifies its input with its own logic beside the registry: it tests `/^shell\b/i` itself, loops `commands` itself, branches on `c.name === 'acp'` and `c.name === 'browser'`, and repeats the `openDbs` → `resolveRouteChoice` → `toPrefixedCommand` logic that `resolveUnknownCommand` in `src/command/router.ts` already has.

The result is that a message behaves differently from the same text typed into the tab. `!ls` and `!!top` are not recognized as shell at all and come back as unknown commands. `shell --pty ls` hands `--pty ls` to the piped shell as the command text. Text with leading whitespace misses every registry predicate.

After this change, the capture path classifies input with `resolveCommand` from `src/resolve.ts`, the resolver `CommandManager.run` uses, so every shell spelling and flag resolves as it does in the command bar. The capture-specific behavior stays: a shell command runs piped with `detect: false`, and anything that needs a terminal is refused with `Cannot run interactive command remotely: <cmd>`. That now includes a `--pty`-flagged command and `!!<cmd>`, since a forced PTY is interactive by request. The two name branches become an optional `capture` hook on `Command`, and the route-recognition step both unknown-command routers perform lives in one helper.

## Approach

- `CaptureManager.run` calls `resolveCommand(text)` and switches on the kind:
  - `shell`: handled before the tab lookup, as today. Refuse when `res.pty` is set or `isInteractive(res.cmd)` holds; otherwise `managers.shell.run(label, res.cmd, { onComplete: callback, detect: false })`. A bare `shell --pty` or `!!` has no command, and the command bar would open the user's login shell for it, so the refusal names that shell (`process.env.SHELL || 'bash'`, the same fallback `CommandManager.runShell` uses).
  - Every other kind first checks the tab exists (`Tab not found`), as today.
  - `app`: look the command up in the registry by `res.name`. When it has a `capture` hook, call it with `(res.cmd, label, managers, callback)`. Otherwise await `managers.command.executeCommand` and answer with the tab's last new log entry, as today.
  - `output`, `unknown`, and `empty`: hand off to `routeUnknownCommand` exactly as the old loop's fall-through did, with `res.cmd` (or `''` for `empty`) as the trimmed text. Its `help` output branch and empty-string branch both stay reachable through these kinds.
- `Command` in `src/commands/types.ts` gains an optional `capture?: (command, label, managers, reply) => void`, with a one-line comment saying it answers an agent message directly instead of the reply being read back from the transcript. `src/commands/acp.ts` implements it as `managers.acp.run(label, command, reply)` and `src/commands/browser.ts` as `managers.browser.runInteractive(command, label, reply)` — the calls the name branches make today.
- `src/route-choice.ts` gains `recognizeRoute(cmd, label, managers)`, returning `{ kind: 'routed', command }` (the prefixed command to run) or `{ kind: 'unrouted', openDbs }`. `resolveUnknownCommand` in `src/command/router.ts` and `routeUnknownCommand` in `src/capture/router.ts` both call it; each keeps its own fallback (the route chooser, or the unknown-command message).
- `ai/guidelines/architecture-principles.md` §5 says there is no second execution path. After this change the classification is shared, but the capture path still executes differently, so §5 names what remains: the capture path's own piped-shell call, the `capture` hook, and the last-log-entry reply for commands without one. Principle 10 requires the architecture doc to move with a structural change like this one, and the backlog item asks for it.

Rejected: changing `Command.run` to return its output so the last-log-entry guess disappears. Every command would change, and that is the fuller fix the backlog item's proposal risk names as a follow-up.

## Implementation steps

1. `src/route-choice.ts`: add `recognizeRoute`. Switch `src/command/router.ts` and `src/capture/router.ts` to call it.
2. `src/commands/types.ts`: add the optional `capture` hook. Implement it in `src/commands/acp.ts` and `src/commands/browser.ts`.
3. `src/capture/manager.ts`: replace the regex test, the registry loop, and the two name branches with the `resolveCommand` switch described above.
4. `product/specs/messaging.md`: say a messaged command is classified exactly as typed text is (`!`, `!!`, `shell`, `shell --pty`, a leading `/`), that a `--pty` or `!!` command is refused as interactive, and that a bare one is refused naming the login shell.
5. `ai/guidelines/architecture-principles.md` §5: add the paragraph naming what remains of the capture path's separate execution.
6. Run `./scripts/run.mjs check-diff` after each step.

## Tests

- `src/capture/manager.test.ts`: `!ls` runs `ls` through the shell manager with `detect: false`.
- `src/capture/manager.test.ts`: `shell --pty ls` and `!!top` are refused as interactive and never reach the shell manager.
- `src/capture/manager.test.ts`: a bare `shell --pty` is refused naming the login shell.
- `src/capture/manager.test.ts`: text with leading whitespace dispatches the matched command.
- `src/capture/manager.test.ts`: a registry command with a `capture` hook answers through that hook instead of `executeCommand`.
- `src/commands/acp.test.ts` and `src/commands/browser.test.ts`: each command's `capture` hook forwards the reply to its manager.
- `src/route-choice.test.ts` (new): `recognizeRoute` returns the prefixed command when exactly one db is open for a SQL statement, and `unrouted` with the open databases when nothing fits.
- The existing `src/capture/manager.test.ts` cases (shell, interactive refusal, missing tab, `acp`/`browser`, matched command, `harness`/`ssh`, unknown fallback) and every `src/capture/router.test.ts` case keep passing unchanged.

## Out of scope

- Returning output from `Command.run`, which would remove the last-log-entry guess for commands without a `capture` hook.
- Adding `capture` hooks to other commands.
- Changing the command bar's own dispatch in `CommandManager.run`.

## Documentation and specification impact

`product/specs/messaging.md` gains the classification and `--pty` refusal rules above. `documentation/user-documentation/command-bar/messaging.md` already says a messaged command runs "same as if typed there", which this change makes true for the shell spellings, so it is left alone. `help.md` does not describe messaged shell commands.
