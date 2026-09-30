# Reserve the Command Name a Built-in Actually Matches

**Complexity: 4/10** — one predicate in the plugin command adapter, one lookup in the command manager, three test cases, and a spec line. No new module, and no change to how a command dispatches.

## Goal

The search tab must be reachable. It declares `command: 'search'`, and `createPluginCommands` refuses that claim with `reserved tab plugin command claim "search"`, which records the plugin disabled at module load — so neither the `search` command nor the Cmd+Shift+F chord opens the tab, and the whole feature is unreachable on every start.

The cause is that `createPluginCommands` reserves each built-in's registry `name` rather than the form the built-in actually matches. The transcript search is registered as `search` while matching only `search transcript <pattern>`, so a bare `search` reaches nothing of its and the name is free.

## Approach

Two things have to give before a plugin can hold a name a built-in is registered under, and the first attempt at this found only one of them.

**Reserve what a command matches, not what it is called.** A built-in whose own `match` rejects its bare name does not reserve that name, because a plugin holding it cannot shadow anything: `resolveCommand` walks the registry in order and only reaches a plugin's command when no core command matched the input first.

**Resolve a name to the command that matched the input.** `resolveCommand` picks a command by walking `match`, but `executeCommand` in `src/command/manager.ts` then looked the name back up with `commands.find((entry) => entry.name === name)` — first match wins. With a shared name that always found the built-in, so admitting the claim was necessary and not sufficient: the plugin's command was registered, the plugin was no longer disabled, and a bare `search` still ran the transcript search. The lookup has to test `match` too, and fall back to the bare name only when nothing matches it.

This is deliberately the reservation and resolution questions, not the dispatch order. `resolveCommand`'s order and the core-first rule are untouched, and `search transcript foo` must keep reaching the built-in.

## Implementation steps

1. **Reserve what a built-in matches.** In `src/plugins/command-adapter.ts`, add a `reservedName(command)` helper returning the lowercased name when `command.match(name)` is true and `undefined` otherwise, and build the `reserved` set from its results. Every built-in that answers to its own bare name is reserved exactly as before; the transcript search is the one that stops reserving a name it never answers to.

2. **Resolve a name to the command that matched.** In `src/command/manager.ts`, `executeCommand` finds the entry with that name whose `match` accepts the command, falling back to the first entry with the name when none does. A single-name registry is unaffected: the matched entry is the same one the bare lookup found.

3. **Keep the rest of the rule intact.** `ROUTE_NAMES`, `RESERVED_NON_COMMAND_NAMES`, and the duplicate-claim check are unchanged, so `shell`, `help`, and a second plugin claiming a name both still lose with their existing recorded reasons.

4. **Say it in the spec.** `product/specs/tab-plugins.md` states that a claim is refused if it collides with any built-in. Narrow that to a built-in that answers to the claimed name, and note that a plugin's claim and a built-in's form can coexist.

## Tests

- `src/plugins/adapters.test.ts`: a declaration claiming `search` is admitted and contributes a command, with no recorded rejection.
- The same file: the existing "refuses every production reserved name" case keeps passing, with its input list now derived the same way — a name is reserved when a built-in answers to it — so the transcript search drops out of the list rather than being special-cased.
- The same file: a case pinning that the two forms coexist — the plugin's command matches `search foo`, the built-in still matches `search transcript foo`, and the built-in still does not match `search foo`.
- `src/command/manager.test.ts`: `executeCommand` with the shared name runs the plugin's command for a bare `search` and leaves `search transcript fox` to the built-in. This is the half the first attempt missed, and the case that would have caught it.
- The frozen v1 fixture and every other plugin's command route must keep passing untouched.

A test helper is needed that gives the adapter the core list rather than the full registry: `src/plugins/adapters.test.ts` imports `commands` from `src/commands/index.ts`, which already carries each plugin's generated command — including the search tab's — so passing it to the adapter would reserve `search` for the very plugin the case is about. Filter to the built-ins the way production does.

## Out of scope

- Renaming either command. Both stay `search`; the reservation and the lookup are what change.
- How a command dispatches. `resolveCommand`'s order and the core-first rule are untouched.
- Any other built-in whose registry name differs from what it matches. `reservedName` handles whichever exist without naming one.
- Tagging a command with the plugin that contributed it, so `executeCommand` could resolve by owner instead of by match. The match test is smaller and needs no new field on the shared `Command` type.
