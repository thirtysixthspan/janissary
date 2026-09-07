# Give `harness` and `ssh` a definition in the command registry

**Complexity: 5/10** — two new command modules over one shared helper, two registry entries, two branches deleted, one reserved-name list shortened, and the tests that pin the dispatch each path takes. One user-visible behavior changes: both commands start working on the capture path, which is the point.

`CommandManager.run` (`src/command/manager.ts`) tests `/^harness\b/i` and `/^ssh\b/i` before calling `resolveCommand`, and each branch appends the input to the transcript, calls `this.managers.harness.run(input)` or `this.managers.ssh.run(input)`, and appends the returned error string — the same three statements twice.

Neither name appears in `coreCommands` (`src/commands/index.ts`), so `resolveCommand` classifies both as unknown, and so does the registry loop in `CaptureManager.run` (`src/capture/manager.ts`) — which is what `AgentCommunicationManager` calls for a `command`- or `request`-kind message. A command sent to another tab, or asked of it as a request, therefore answers `Unknown command: "harness claude"` for the very text that launches a harness when typed into that same tab. `ROUTE_NAMES` in `src/plugins/command-adapter.ts` restates `['schedule', 'harness', 'ssh', 'shell']` by hand to keep a plugin from claiming a name the registry would never reach, with nothing tying that list to the branches it exists to shadow.

## Goal

`harness` and `ssh` resolve through the registry every dispatcher already consults, so all three dispatch paths agree on what they are, and the hand-maintained shadow list shrinks to the names that genuinely still run ahead of the registry.

## Design decisions

**One shared body, two commands.** Both branches are byte-identical apart from which manager they call, and both managers expose the same `run(input): string | undefined` shape. `src/commands/delegated.ts` holds that body once — append the input, delegate, append the returned error — and each command passes its own manager call in. Factoring it out is what stops the duplication from simply moving.

**`match` keeps the existing regular expressions.** `/^harness\b/i` and `/^ssh\b/i` are exactly what the branches being deleted tested, and they are the same idiom `schedule`, `agent`, `browser`, and a dozen others already use. First-token matching would be a subtly different rule (`harness-foo` matches the regex and would not match a first-token test), and changing dispatch behavior is not what this item is for.

**Bare `harness` moves into the command's own `run`.** It opens the launch dialog and records no transcript line, which is a property of the `harness` command rather than of the dispatcher. Bare `schedule` stays where it is — the `schedule` command already exists in the registry and moving its dialog case is a separate question — so `CommandManager.run` is left with one pre-registry branch instead of three.

**`ROUTE_NAMES` shrinks to `['schedule', 'shell']`.** Both removed names are now reserved anyway, through `coreCommands.map((command) => command.name)`, which is the tie to the registry that the hand-written entries lacked. `shell` has no registry entry and is still handled ahead of it by `resolveCommand`, and bare `schedule` still runs ahead of the registry, so both stay.

**Placement in `coreCommands` is checked, not assumed.** Order matters only where one command's `match` also accepts another's input — the reason `acpReset` precedes `acp` and `monitors` precedes `monitor`. No existing predicate accepts a string starting `harness` or `ssh`, and neither new predicate accepts any other command's input, so the two go in beside `schedule` with a comment recording that check.

**Principle 5 of the architecture principles is updated in the same change.** It currently names these two as the standing exception to "one command, one definition" — accurately, until this lands. Principle 10 says a structural change updates the architecture docs in the same change, and leaving the sentence would restale the file that was corrected one commit ago.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| The `Command` shape and the registry | `src/commands/types.ts`, `src/commands/index.ts` |
| The regex-`match` idiom a new command follows | `src/commands/schedule.ts` |
| The two managers, both `run(input): string \| undefined` | `HarnessManager.run` (`src/harness/manager.ts:79`), `SshManager.run` (`src/ssh-manager.ts:16`) |
| The two branches being deleted | `src/command/manager.ts:70`–`:84` |
| The reserved-name list | `ROUTE_NAMES`, `src/plugins/command-adapter.ts:7` |
| The dispatcher that will now reach them | `CaptureManager.run`, `src/capture/manager.ts` |

## Implementation steps

1. **`src/commands/delegated.ts`.** Export `runDelegated(input, label, managers, delegate)`: append `{ input, output: '' }`, call `delegate(input)`, and append `{ input: '', output: error }` when it answers with one.

2. **`src/commands/harness.ts`.** A `Command` named `harness`, matching `/^harness\b/i`, whose `run` opens the launch dialog for a bare `harness` and otherwise calls `runDelegated` against `managers.harness.run`.

3. **`src/commands/ssh.ts`.** A `Command` named `ssh`, matching `/^ssh\b/i`, whose `run` calls `runDelegated` against `managers.ssh.run`.

4. **`src/commands/index.ts`.** Import and register both beside `schedule`.

5. **`src/command/manager.ts`.** Delete both branches from `run`, leaving the bare-`schedule` case ahead of `resolveCommand`.

6. **`src/plugins/command-adapter.ts`.** Reduce `ROUTE_NAMES` to `['schedule', 'shell']` and update its comment to say why those two and not the others.

7. **`ai/guidelines/architecture-principles.md`.** Remove principle 5's paragraph naming `harness` and `ssh` as bypasses, and note the one branch that genuinely remains.

## Tests

- **`src/resolve.test.ts`** — `resolveCommand('harness claude')` and `resolveCommand('ssh host')` now classify as `app` with the matching name, where they previously came back `unknown`.
- **`src/capture/manager.test.ts`** — the change this item exists for: a `harness …` and an `ssh …` sent through the capture path run their command instead of answering `Unknown command: "…"`. Every existing case in the file must keep passing.
- **`src/command/manager.test.ts`** — the typed path still reaches both managers with the full input, bare `harness` still opens the launch dialog and records no transcript line, and a manager's error string is still appended.
- **`src/plugins/command-adapter.test.ts`** — a plugin claiming `harness` or `ssh` is still refused, now through the registry's own names rather than the hand-written list.
- **`src/harness/manager.test.ts`, `src/ssh.test.ts`** must pass **unchanged** — neither manager's own behavior moves.

## Out of scope

- **Moving bare `schedule` into the `schedule` command.** The same shape as the `harness` dialog case, but that command already resolves through the registry, so it is not what this item is about.
- **`shell`'s handling ahead of the registry.** `resolveCommand` strips the keyword and returns a `shell` resolution; that is a different mechanism from a `Command`, not a missing entry.
- **`coreAvailableCommands` drifting from the registry.** A separate backlog item owns rebuilding that list.
- **The capture path's `acp`/`browser` special cases** in `dispatchMatchedCommand`, which route around `executeCommand` for their own reasons.
