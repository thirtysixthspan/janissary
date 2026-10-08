# Point the feature-boundaries test at the metadata component's current name

**Complexity: 2/10** — two literals in one test file, no production code, no new behavior. The
diagnosis is the work: the failure only reproduces on the CI runner, so establishing that the stale
fixture path is the cause (rather than the boundary rule itself, or a real regression in the rename)
takes longer than the edit. Once established, the change is mechanical and the existing tests are the
verification.

## Summary

`feat(tabs)!: remove agent tabs` renamed `web/src/shared/AgentTabMeta.tsx` to
`web/src/shared/HarnessTabMeta.tsx` and did not update `src/eslint-feature-boundaries.test.ts`. The
suite's `tests` job is red on the PR: `src/eslint-feature-boundaries.test.ts:99` fails with
`expected [] to have a length of 1 but got +0` in `rejects a shared module importing a feature`.

The rule under test explains why that assertion turned into a coin flip.
`import-x/no-restricted-paths` resolves the import and bails out **without reporting** when resolution
comes back empty (`node_modules/eslint-plugin-import-x/lib/rules/no-restricted-paths.js:189-192`):

```js
const absoluteImportPath = resolve(importPath, context);
if (!absoluteImportPath) {
  return;
}
```

The `filePath` that test lints under, `web/src/shared/AgentTabMeta.tsx`, no longer exists on disk.
Resolving an import *from* a path that does not exist is not deterministic: it depends on how much of
the TypeScript program the resolver has warmed. Measured against this commit:

| linting `filePath`                     | boundary messages reported |
| -------------------------------------- | -------------------------- |
| `web/src/shared/AgentTabMeta.tsx` (gone) | 0 in isolation, 1 only after earlier lints in the same process |
| `web/src/shared/HarnessTabMeta.tsx` (real) | 1, always — including as the first lint in a fresh process |

So the local run passed by accident of ordering, and the CI runner hit the ordering that resolves
nothing. The test was asserting on a fixture that had been renamed out from under it.

The sibling case at line 86-92 is quietly wrong in the other direction. It imports
`'../shared/AgentTabMeta'` and asserts `[]`, which reads as "a feature may import shared UI" — but on
CI it gets that empty array precisely because the module it names cannot be resolved, so it is
currently a vacuous assertion rather than a test of anything.

## Goal

Both cases in `src/eslint-feature-boundaries.test.ts` that name the shared metadata component name the
component that actually exists, so each one asserts what it claims: the rejection case genuinely
exercises the shared-must-not-import-a-feature zone, and the allowance case genuinely exercises a
feature's right to import shared UI.

## Approach

Rename the two stale literals, leaving every assertion, ordering, and the `beforeAll` warm-up exactly
as they are:

1. `'rejects a shared module importing a feature'` — lint under
   `web/src/shared/HarnessTabMeta.tsx` instead of `web/src/shared/AgentTabMeta.tsx`.
2. `'allows a feature to import shared UI'` — import `'../shared/HarnessTabMeta'` instead of
   `'../shared/AgentTabMeta'`, so the empty-message assertion is earned by a resolvable, legal import.

Both fixtures keep the same real component, which is what makes them comparable: it is the shared
metadata row, so it is still the right thing to stand in for "a shared module" and "a shared module a
feature is allowed to import". `HarnessTabMeta.tsx` and `HarnessTab.tsx` both exist, so the zone's
`from` entry (`./web/src/harness`) resolves and the report is produced.

No production change. The boundary rule, `eslint.config.mjs`'s `clientFeatureZones`, and the TypeScript
import resolver are all correct as they stand; the test was the only thing pointing at a path that
had been renamed away.

## Implementation steps

1. `src/eslint-feature-boundaries.test.ts` — update the two `AgentTabMeta` occurrences (the `filePath`
   on line 97 and the import specifier on line 88) to `HarnessTabMeta`.
2. Run `./scripts/run.mjs check-diff`, then re-run `src/eslint-feature-boundaries.test.ts` in
   isolation so the fixture is exercised against a cold resolver — the condition under which the stale
   path reported nothing.
3. Run the full `npm run test` once, to confirm the whole suite is green the way CI runs it and that
   nothing else depended on the old name.

## Tests

No new test cases. The fix makes two existing cases mean what they already say:
`rejects a shared module importing a feature` now asserts a report the rule produces from a real file
in a cold process, and `allows a feature to import shared UI` now asserts an empty result for an import
that actually resolves. Both are verified by running the file directly and as part of the full suite.

## Out of scope

- The stale `AgentTabMeta` references in comments at `src/controller/recording.ts:6` and
  `src/controller/transcript.ts:7`, which point at the renamed file. Real dangling references from the
  same rename, but they affect no test and no behavior; they are a separate cleanup.
- Historical `AgentTabMeta` mentions in `CHANGELOG.md` and `product/plans/complete/*.md`. Those record
  what was true when written and are not to be rewritten.
- The remaining entry in `product/backlog/pull-request.md` (the documentation correction for startup,
  remote shell restoration, and conversation shell launches), which this change does not address.