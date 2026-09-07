# Have the built-in classifier return its decision instead of encoding it in prose

**Complexity: 4/10** — one return type, two callers branching on it, a dozen unreachable branches deleted, one hand-maintained list rebuilt from the registry, and the tests that pin the old shape. One small user-visible change: the two spellings of the unknown-command message collapse into one.

`getOutput` in `src/commands.ts` overloads a `string | null` return with three meanings — here is output, this is a known command with nothing to say, and this command is unrecognized — and distinguishes the third only by the leading words of a user-facing message. Two callers then re-derive it with their own prefix tests:

- `resolveCommand` (`src/resolve.ts:55`) — `output.startsWith('Unknown command:')`.
- `routeUnknownCommand` (`src/capture/router.ts:15`) — the same test at its opening guard, and then a second, differently-worded copy of the message at its final callback (`Unknown command: "<x>".`, without the `Type "help"` half).

Rewording the message — a plain copy edit, with no compiler or test signalling the dependency — would make every unrecognized command classify as a known one carrying output, so the probabilistic route recognition behind it would stop running and the route chooser would never open.

## Goal

The classifier returns what it decided as a value. The message text becomes editable again, is built in one place, and the branches the registry made unreachable are gone rather than left looking live.

## Design decisions

**A discriminated result, shaped like the one `resolveCommand` already exposes.** `{ kind: 'output'; text } | { kind: 'silent' } | { kind: 'unknown'; text }` — the same `kind`-led vocabulary `Resolution` uses, so the two read as one pipeline rather than two conventions meeting.

**One place builds the message.** `unknownCommandMessage(command)` is exported alongside, and both callers use it. The short spelling in `routeUnknownCommand`'s final callback goes away, so a captured or messaged command now gets the same full message a typed one does. That is the one user-visible change here, and collapsing the two spellings is the point.

**The unreachable branches are deleted, not preserved.** Both callers loop the `commands` registry before ever calling `getOutput` — `resolveCommand` at `src/resolve.ts:45` and `CaptureManager.run` at `src/capture/manager.ts:23` — and every name `getOutput` returns `null` for (`clear`, `state`, `hist`, `quit`/`exit`/`close`, `agent`, `msg`, `broadcast`, `acp`, `db`, `connection`, `next`) is now a `Command`. Each was checked against the registry rather than assumed. What is left is `help`, the empty string, and the unknown fallback.

**`silent` survives the cull because the empty string still reaches it.** `CaptureManager.run` passes an empty message straight through its registry loop (no predicate matches `''`) into `routeUnknownCommand`. Keeping the arm is what stops that path from being renamed into "unknown" by accident.

**`coreAvailableCommands` is rebuilt from the registry — after breaking the import cycle that would otherwise cause.** The list has drifted (it omits more than a dozen registered commands) and its only unique contribution is `help`, the one built-in with no `Command` entry. But it has *two* consumers, not one: the help fallback in `buildHelp`, and the reserved-name set in `src/plugins/command-adapter.ts`. Importing `commands` into `src/commands.ts` while `command-adapter.ts` still imports back out of it would form `commands.ts → commands/index.ts → command-adapter.ts → commands.ts`, and since `createPluginCommands` runs at `commands/index.ts`'s module scope, it would read `coreAvailableCommands` in its temporal dead zone and throw at startup. So the one name that list uniquely carries moves to its own dependency-free module, `src/commands/reserved.ts`, which `command-adapter.ts` imports instead — and `src/commands.ts` is then free to build `availableCommands` from the registry.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| The `kind`-led result shape to match | `Resolution`, `src/resolve.ts:8` |
| The registry both callers consult first | `commands`, `src/commands/index.ts` |
| The two prefix tests being deleted | `src/resolve.ts:55`, `src/capture/router.ts:15` |
| The second spelling of the message | `src/capture/router.ts:27` |
| The reserved-name set that also reads the list | `createPluginCommands`, `src/plugins/command-adapter.ts:20` |

## Implementation steps

1. **`src/commands/reserved.ts`.** Export `RESERVED_NON_COMMAND_NAMES = ['help']` — built-in names a plugin must not claim that have no `Command` entry to reserve them. No imports, so nothing can cycle through it.

2. **`src/plugins/command-adapter.ts`.** Read that instead of `coreAvailableCommands`.

3. **`src/commands.ts`.** Export `CommandOutput` and `unknownCommandMessage`; change `getOutput` to return the result, keeping only the `help`, empty-string, and unknown arms. Delete `coreAvailableCommands` and build `availableCommands` from `RESERVED_NON_COMMAND_NAMES` plus every registered command's name.

4. **`src/resolve.ts`.** Branch on `kind`: `silent` → `{ kind: 'empty' }`, otherwise `{ kind, cmd, output: result.text }`.

5. **`src/capture/router.ts`.** Branch on `kind`: `output` appends and calls back as today; `silent` and `unknown` both fall through to route resolution and then `unknownCommandMessage(trimmed)`.

## Tests

- **`src/commands/commands.test.ts`** — rewritten to the result shape. Its ten `toBeNull()` cases pinned branches that no longer exist, so they are replaced by cases asserting those names now classify as `unknown` here *and* never reach `getOutput` in practice, because `resolveCommand` answers `app` for each. That pairing is what keeps the deletion honest rather than just green.
- **`src/commands.test.ts`** — `availableCommands` keeps its `conversations`/no-`chat` guarantee, now derived; a new case asserts it contains a command the old hand-written list omitted.
- **`src/commands/resolve.test.ts`** — existing cases pass unchanged; a new one asserts the `unknown` classification survives a reworded message, by checking `kind` rather than the text.
- **`src/capture/manager.test.ts`** — the unknown-command fallback now answers with the single full message; its existing `stringContaining('Unknown command')` assertion still holds, and a new case pins the whole string so the two spellings cannot diverge again.
- **`src/plugins/adapters.test.ts`** — its reserved-name case reads `coreAvailableCommands`; it moves to the new module and must still refuse every production reserved name.

## Out of scope

- **`help` becoming a `Command`.** It would remove the last reserved non-command name, but `getOutput` is also the help text's cache, and moving it is a separate change.
- **`resolveUnknownCommand` in `src/command/router.ts`.** It never calls `getOutput` and builds no message; the route chooser it opens is untouched.
- **The help fallback's wording or ordering.** Only its source changes.
- **The `Resolution` union itself**, which already reports its decision as a value.
