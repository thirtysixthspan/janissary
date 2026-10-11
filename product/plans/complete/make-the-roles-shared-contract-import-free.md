# Make the roles shared contract import-free

**Complexity: 4/10** — one import replaced by one four-line predicate, and two source-level regressions that pin a rule no lint rule in the repo currently enforces. The change itself is trivial; what carries the weight is proving the property afterwards, because nothing today fails when it is broken.

`src/plugins/roles/shared.ts` opens with `import { isRecord } from '../api.js'`, the same line thirteen other plugin contracts carry. The rule it breaks is stated plainly in `ai/guidelines/plugins-tabs.md`: "Shared guards must reject arrays and `null` when an object is required and validate every required field. They stay hand-written and import-free." The client reaches this contract through `@shared/plugins/roles/shared`, so that one line is a runtime dependency from the roles **client** chunk into the **server** plugin API — a module that re-exports `src/database/query.ts` and `src/shell/zsh-startup/script.ts`. Browser safety for the tab therefore currently depends on those unrelated host exports never acquiring a Node dependency of their own, which is not a property anyone is testing.

Thirteen sibling contracts still carry the import. This unit fixes the roles contract — the one this pull request adds — and leaves them alone, because a mechanical sweep across every contract is a different piece of work with its own review.

## Goal

- `src/plugins/roles/shared.ts` declares no imports at all, and its guards, types, and constants are self-contained.
- The roles client entry's module graph reaches neither the server plugin API nor any `node:` module, so the tab's browser safety is a property of the source rather than of what unrelated host modules happen to export today.
- The published server API and every other plugin's shared contract are untouched.

## Design decisions

- **A local object predicate rather than a moved shared one.** `isRecord` is three lines and already duplicated in spirit by every contract's own hand-written checks. The alternative — a new home for it and a sweep of the thirteen siblings — is precisely the scope this unit rules out, and a predicate reachable from the shared contract would still be an import.
- **A source-level graph walk, not a build.** Building the web bundle and inspecting the emitted chunk would prove the property most directly, but it would cost a production build inside `npm test`, which no test here does and which would make the suite's runtime depend on the bundler. Walking the static import graph from `web/src/plugins/roles/index.tsx` answers the same question in milliseconds from the same sources the bundler reads. What it does not model is dynamic `import()` — which for this plugin is only the loader map itself, outside the entry.
- **The contract's own no-import assertion lives beside the contract.** A lint rule would be the durable enforcement, but it would have to be scoped to exactly one file to avoid failing the thirteen siblings, and a rule that fires on one path is a rule nobody reads. A test that reads its own source states the intent where a reader of the guard already is.
- **The plan file is corrected, not the contracts rewritten.** `product/plans/complete/roles-tab.md` prescribes importing `isRecord` from the server API in the roles contract's bullet. That is the prescription this work reverses, and a completed plan is the artifact a later reader trusts, so the sentence is corrected to the rule actually followed.

## Implementation steps

1. **`src/plugins/roles/shared.ts`.** Replace the import with a local `isRecord` predicate beside the other hand-written guards, leaving every type, constant, and guard body exactly as it is.
2. **`src/plugins/roles/shared.test.ts`.** Add a case asserting the contract's own source declares no import.
3. **`web/src/plugins/roles/chunk-imports.test.ts`** (new) — walk the client entry's static import graph and assert it reaches neither the server plugin API nor a `node:` module.
4. **`product/plans/complete/roles-tab.md`.** Correct the proposed-change sentence that prescribes the server API import.

## Tests

- The roles contract declares no import statements.
- The roles client entry's transitive static imports include no `node:` specifier and no `src/plugins/api.ts`, which fails today and passes after the change.
- The existing guard coverage keeps passing: the payload guard and every intent guard, now running against a contract that holds its own predicate.

## Out of scope

- The thirteen other plugin contracts that still import `isRecord` from the server API, and any lint rule that would cover them.
- The published server API and the client plugin API, neither of which changes.
- Replacing `readFileSync` with something else in the graph walk, or modelling dynamic `import()` in it.
- Any behavior, contract, spec, or user-documentation change: nothing about the tab's behavior moves.

## Verification

- `./scripts/run.mjs check-diff` is clean: lint, both typechecks, and the roles tests on both sides.
- Confirm the chunk claim by hand once: `npm run build` the web app and confirm no `node:`-bearing module lands in the roles chunk. The automated check covers the same ground from the sources the bundler reads.