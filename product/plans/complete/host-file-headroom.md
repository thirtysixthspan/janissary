# Leave headroom in the three host files this diff pushes to the file-size ceiling

**Complexity: 5/10** — three extractions across three load-bearing modules, each of which must behave identically afterwards.

**Goal.** This diff ends `src/tab/manager.ts` at 200 counted lines, `src/plugins/host.ts` at 197 and `src/plugins/context.ts` at 196, against the `max-lines` limit of 200 in `eslint.config.mjs`. The next change to any of the three fails lint on a count rather than on a design, and the cheapest repair at that point is to compact a file or drop a comment — which is what the code guidelines exist to prevent.

**Approach.** Extract, never compact. Each file's seam was chosen by reading it rather than by counting, and two of the three differ from what the reviewer's note proposed — the note was written against estimates and its reasons are recorded below.

**`src/plugins/context.ts` → `line-capabilities.ts` and `declared-resources.ts`.** As proposed, and it is the right seam: `originTab`, `dispatchLine`, `completeLine` and `terminalRunning` are the four capabilities this pull request added, they depend only on `managers`, `declaration`, `origin`, `answeringLabel` and `isEnabled`, and `createPluginContext` composes them back with one spread. `declaredResources` sits beside them because it is the other half of what a payload factory is handed.

**`src/tab/manager.ts` → `plugin-terminals.ts`.** `spawnTerminal`'s body moves, taking the `PseudoterminalManager` as a parameter — read per call rather than captured at construction, because `managers.pty` is assigned after `TabManager` is built (`makeTabManagerWithManagers` does exactly that, and production does too). `adoptTerminal` and `killTerminal` stay where they are: each is already a single line that says all there is to say, and a module holding two delegations is a seam with nothing in it. That is a narrower extraction than the note proposed and reaches the same headroom.

**`src/plugins/host.ts` → `host-records.ts`.** Not the `records`/`invoke`/`disable` port the note named. That port is three closures over `this`, so moving its construction into `host-channels.ts` cannot remove it from the host — it can only be reached through an interface the host implements, which buys six lines and costs the file its most readable constructor. What the constructor actually does twice is build two things, and only one of them has a seam: the record registry, with its duplicate-id check and the seeding of claims refused while the registries were being built. That is a question about what a record *is*, which is `status.ts`'s subject, and it moves out whole.

## Implementation

1. `src/plugins/line-capabilities.ts` — the four capabilities as one function returning the `Pick` of them; `src/plugins/declared-resources.ts` — the resource gate beside them. `createPluginContext` spreads the first and calls the second.
2. `src/tab/plugin-terminals.ts` — `spawnPluginTerminal(pty, options)`, carrying the existing `args` comment about `undefined` reaching `spawnPty`'s fallback.
3. `src/plugins/host-records.ts` — `buildPluginRecords(declarations)` returning the seeded map, throwing on a duplicate id as the loop does today.

## Tests

`src/plugins/shell-capabilities.test.ts`, `src/tab/manager.test.ts` and `src/plugins/shell/activate.test.ts` cover the behaviour being moved and must pass **untouched**. `src/plugins/context.test.ts` and `src/plugins/host.test.ts` cover the two other extractions, also untouched. If a case has to change to accommodate a move, the seam was drawn in the wrong place.

## Out of scope

- Any behaviour change. This is a move, and the verification that it is one is that not one assertion moves with it.
- `ShellTab.tsx`, which the diff also pushes to 149 counted lines. It has room, so no extraction is warranted; extracting to stay under a number that is not yet reached is the same mistake this entry exists to prevent.