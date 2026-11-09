# Restore the native question approve label coverage in the payload test

Issue: The question-row identity plan promised a payload-test fixture containing the native `question approve` row and an assertion that it maps to label `question approve`, but the later payload-coverage repair replaced the fixture and dropped that row. A regression in the label mapping could mislabel the native `question approve` row without a failing payload test; the Commands tab test builds its own rows, so it cannot catch a server-side mapping regression.

Complexity rating: 1/10 — one test file, a fixture row and matching expectation tuples, no production change.

## Goal

Restore the promised coverage in `src/plugins/commands/payload.test.ts`: the `DATA.commands` fixture includes the native `question approve` row after the `question ask` row, and the `toPayload` row-order label test asserts it maps to label `question approve`. The existing builtin `question` and native `question ask` assertions stay intact.

## Approach

Extend the shared `DATA.commands` fixture with the native `question approve` row, shaped like the existing `question ask` row but with its own name, forms, and parent `question`. Add its tuple to the row-order label expectation. Because the parent-canonicalization test walks every fixture row and compares an exact array, add the matching `question approve` parent tuple there as well so that assertion keeps covering the fixture in full. No production code changes.

## Implementation steps

1. Add `row({ name: 'question approve', kind: 'native', forms: ['question approve'], parent: 'question', nativeTool: 'question' })` to `DATA.commands` immediately after the `question ask` row.
2. Add `['question approve', 'question approve']` to the row-order label expectation immediately after the `question ask` tuple.
3. Add `['question approve', 'question']` to the parent-canonicalization expectation immediately after the `question ask` parent tuple, keeping its exact-array assertion complete.
4. Run `$janissary/scripts/run.mjs check-diff`.

## Tests

- `src/plugins/commands/payload.test.ts`: the row-order label test maps the native `question approve` row to `question approve`, beside the builtin `question` and native `question ask` rows.
- Same file: the parent-canonicalization test keeps `question` as the native `question approve` row's parent.
- Existing `src/plugins/commands/activate.test.ts` and `web/src/plugins/commands/CommandsTab.test.tsx` question-row cases continue to pass unchanged.

## Specs and docs

- `product/specs/commands-tab.md` already describes the label rule that gives the native `question approve` row its label, and this change restores test coverage only, so no spec change is needed.
- No help or user-documentation change: user-visible behavior is unchanged.

## Out of scope

- Any production change to `src/plugins/commands/payload.ts` or any other source file.
- Changes to `src/plugins/commands/activate.test.ts`, `web/src/plugins/commands/CommandsTab.test.tsx`, or other test files.
- Broader payload-mapping coverage beyond the native `question approve` label case.
- Any other backlog entry.
