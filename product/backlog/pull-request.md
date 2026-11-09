<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Restore the payload test coverage the question-row repair promised for the native `question approve` label, which the later payload-coverage repair dropped.

Existing Issue: The question-row fix plan promises a payload-test fixture containing the native `question approve` row and an assertion that it maps to label `question approve`, but the final payload test omits that row after the payload-coverage repair replaced the fixture, so the promised coverage is missing. Severity: 2/10

Existing Risk: 2/10 - A regression in the label mapping could mislabel the native `question approve` row without a failing payload test; the Commands tab test builds its own rows, so it cannot catch a server-side mapping regression.

Proposal Risk: 1/10 - Re-adding the row and its expected label pins existing behavior without touching production code; the only risk is another fixture rewrite dropping it again.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1968 "restore the native question approve label coverage in the payload test". In `src/plugins/commands/payload.test.ts`, add `row({ name: 'question approve', kind: 'native', forms: ['question approve'], parent: 'question', nativeTool: 'question' })` to the `DATA.commands` fixture after the `question ask` row, and add `['question approve', 'question approve']` to the label expectation in the `toPayload` row-order test immediately after the `question ask` tuple. This restores the promise in `product/plans/complete/commands-tab-question-row-identity.md` while keeping the existing builtin `question` and native `question ask` assertions; the `activate.test.ts` and `CommandsTab.test.tsx` question-row cases must keep passing, and no production change is needed.
