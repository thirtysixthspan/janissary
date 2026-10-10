# Keep the launcher's shared contract import-free

**Complexity: 4/10** — one predicate defined locally, one weaker duplicate removed, and a source assertion that fails the next time a guard is reached for.

`src/plugins/launcher/shared.ts` is the launcher's published contract: the payload shape, the intent shapes, the guards both sides check against, and the constants they agree on. It is the one module the client reaches through `@shared/plugins/launcher/shared` from inside the lazy chunk, and the plugin architecture requires that a shared contract import nothing — `eslint.plugin-boundaries.mjs` says so in the client block's own message, "an import-free shared contract".

Its first line is `import { isRecord } from '../api.js'`. That is the server plugin API module, whose graph is NodeNext and server-shaped, so the browser bundle for the launcher's lazy chunk drags it in for a three-line predicate. The boundary lint does not catch it because the *server* plugin block permits `../api.js`, and the import-free rule lives only in the client block's message.

The same file already exports `isEmptyIntent`, the guard the flush needs. `activate.ts` does not use it: it defines its own `isEmptyLauncherIntent` beside it, which is weaker — it does not exclude an array, so an array payload of no keys would pass as an empty intent.

## Goal

The launcher's shared contract imports nothing, the flush uses the contract's own guard rather than a weaker local copy, and a test fails the next time either drifts.

## Approach

1. **`shared.ts`** defines the record predicate locally and drops the import. It is the same three lines `src/value-guards.ts` has, written out here because a contract cannot reach across the boundary to borrow them.
2. **`activate.ts`** uses `isEmptyIntent` and deletes its local copy, so one guard answers the question on both sides and an array cannot pass as an empty intent.
3. **`src/plugins/launcher/shared.test.ts`** (new) covers the guards — a payload with a missing or wrongly-typed field, a row that is an array, each intent shape — and asserts, by reading the module's own source, that the contract has no imports at all. The source assertion is what makes the import-free rule enforceable rather than aspirational.

### Rejected alternatives

- Importing `isRecord` from `src/value-guards.ts` instead. That module is outside the plugin directory, so both boundary blocks reject it, and it imports the protocol's types.
- Making the shared contract import type-only. `isRecord` is a value, so the import would still be a runtime edge into the server graph.
- Enforcing the rule only in lint. The server block already permits `../api.js`, and a second server block for shared contracts would be a rule whose only job is one file; a test over the source is the same coverage for less configuration.

## Implementation steps

1. Define the predicate in `shared.ts` and drop the import.
2. Point the flush's payload guard at `isEmptyIntent`.
3. Add the guard tests and the no-imports assertion.
4. Run `./scripts/run.mjs check-diff`, then `npm run build:web` and confirm the launcher is still its own chunk.

## Tests

- `src/plugins/launcher/shared.test.ts`: every guard rejects what it should — a payload missing a field, a row that is an array, each intent's absent or wrong-typed field — and accepts a well-formed one; and the module's source holds no `import` statement.
- `src/plugins/launcher/activate.test.ts` keeps its flush coverage by continuing to send an empty object as the flush's payload.

## Spec updates

- None. No user-visible behaviour changes; `documentation/developer-documentation/tab-plugins.md` already states that a shared contract imports nothing.

## Out of scope

- Adding the launcher's schema literal to `registry.test.tsx`'s pinned list, which is a separate fixture gap.
- Any other plugin's shared contract.
