# Pin command-router priority with declared sample ownership

**Complexity: 5/10** — one required field added to the `Command` contract, one line added to each of the thirty-seven command literals plus the plugin adapter, one new pure checker module, and its tests. No dispatch code changes and no behavior a user can observe changes.

`src/commands/index.ts` builds `coreCommands` as a plain array and `src/resolve.ts` picks the first entry whose `match` accepts the input. Priority is therefore array position, documented only by a prose comment naming the two pairs that currently depend on it (`acp reset` before `acp`, `monitors` before `monitor`). A new command appended to the end whose `match` also accepts an earlier command's input is silently shadowed — or silently shadows — with nothing failing.

## Goal

Every command declares the inputs it owns. A test walks the registry in dispatch order and fails when the first command matching a declared input is not the command that declared it. Adding a command without declaring what it owns is a compile error.

## Design decisions

**Ownership lives on the command, not in a side table.** A central `Record<commandName, string[]>` in the checker module would need its own completeness assertion and would drift from the command files it describes. A required `samples: readonly string[]` on the `Command` interface means a new command file cannot compile without stating what it claims, which is the guard the item asks for. The cost is one line per command literal.

**The check is a pure function over a command list, not a module-load assertion.** `findPriorityConflicts(commands)` takes the list and returns the conflicts, so it can be unit-tested against hand-built lists with known shadowing rather than only against the real registry. `src/commands.test.ts` calls it once on the real `commands` export and asserts the result is empty.

**Two failure modes, one report.** A sample its own command does not match is as much a broken declaration as a sample an earlier command steals, and both read the same way at the call site — so the checker reports `{ input, owner, matchedBy }` with `matchedBy: null` for the unmatched case, and the test asserts one empty array.

**Plugin-contributed commands get samples too.** `createPluginCommands` builds a `Command` per declaration; its literal declares `samples: [name]`. The adapter already refuses names claimed by core commands or reserved, so a contributed sample cannot be shadowed by the core list — and if that refusal ever regressed, this check is what would catch it.

**`help` and `shell` stay out.** Neither has a registry entry: `shell` is stripped by `resolveCommand` before the loop and `help` is answered by `getOutput` after it. The checker only sees what the loop sees.

**The prose comment in `src/commands/index.ts` stays, shortened.** It still explains that position is priority; what it no longer has to do is carry the list of pairs that depend on it, since the samples now do.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| The first-fit dispatch loop the check models | `src/resolve.ts:56`–`:60` |
| The command contract | `src/commands/types.ts` |
| The ordered registry and its plugin tail | `src/commands/index.ts` |
| The contributed-command literal | `src/plugins/command-adapter.ts:43`–`:51` |
| Registry-wide assertions already living together | `src/commands.test.ts` |

## Implementation steps

1. **`src/commands/types.ts`: add `samples`.** `samples: readonly string[]` — the canonical inputs this command owns, as they reach the registry loop (trimmed, `/` already stripped). Document that the registry's order is checked against them.

2. **New module `src/commands/priority.ts`.** Export `type PriorityConflict = { input: string; owner: string; matchedBy: string | null }` and `findPriorityConflicts(commands: readonly Command[]): PriorityConflict[]`: for each command and each of its samples, find the first command in the list whose `match` accepts the sample; record a conflict when that is not the declaring command, with `matchedBy` set to the offending command's name or `null` when nothing matched.

3. **Declare samples on every core command.** One `samples: [...]` entry per literal across the thirty-seven command files (three of them in `src/commands/monitor.ts`). Give the pairs that depend on ordering the inputs that prove it: `acp-reset` claims `'acp reset'`, `acp` claims `'acp'` and `'acp bob'`; `monitors` claims `'monitors'`, `monitor` claims `'monitor'` and `'monitor build'`. `close` claims both of its spellings (`'close'`, `'exit'`). Commands whose `match` requires a second token claim a full form (`'question ask hi'`, `'search transcript hi'`).

4. **`src/plugins/command-adapter.ts`: add `samples: [name]`** to the contributed-command literal.

5. **Fix any test-local `Command` literals the new required field breaks.** `tsc` will name them; they get a `samples: []` or a realistic sample as fits the test.

6. **Trim the ordering comment in `src/commands/index.ts`** to state the invariant and point at the samples and the check, rather than enumerating the dependent pairs.

## Tests

- **New `src/commands/priority.test.ts`** — `findPriorityConflicts` against hand-built lists: a list with no overlap returns `[]`; a broad matcher placed ahead of the specific command that declares the input reports that input with the broad command as `matchedBy`; reversing the two clears it; a sample no command matches is reported with `matchedBy: null`; a sample matched by the declaring command reports nothing even when a later command would also match it.
- **`src/commands.test.ts`** — the real registry has no priority conflicts (`findPriorityConflicts(commands)` is `[]`), and every registered command declares at least one sample.
- **Must keep passing unchanged:** `src/commands.test.ts`'s existing cases, `src/message-handler-exhaustive.test.ts`, `src/question-command.test.ts`, `src/resolve.test.ts`, `src/commands/*.test.ts`, `src/plugins/adapters.test.ts`.

## Out of scope

- **Changing dispatch.** `src/resolve.ts` and `src/command/manager.ts` are correct while the invariant holds; this change checks the invariant rather than replacing the mechanism.
- **Reordering `coreCommands`**, or migrating any command's `match` to a declarative prefix form.
- **Route choices inferred at runtime** (`src/recognizers/`, `src/command/router.ts`). Those are not registry entries and the first-fit loop never sees them.
- **Enforcing the check at module load.** A failing registry should fail a test, not crash the server at import time.
