<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Close the functionality gap in the `reportLayout` dispatch test by asserting that `splitPct` reaches the controller.

Existing Issue: `src/message/handler.test.ts` still sends the old three-field `reportLayout` payload and expects the controller to receive that shape, so it does not cover forwarding the newly required split percentage. Severity: 4/10

Existing Risk: 4/10 - A regression that drops `splitPct` in the RPC dispatch path could leave `layout show` without the current split while the remaining reported sizes still pass this test.

Proposal Risk: 1/10 - An updated dispatch assertion will pin all four fields and catch loss of the split value before it reaches the controller.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1801 "cover splitPct in the reportLayout RPC dispatch test". In `src/message/handler.test.ts`, update the `reportLayout` dispatch test input to include a representative `splitPct` and assert that the controller receives the full four-field layout object. Keep the neighboring validation tests in `src/client-params/core.test.ts` intact; they cover rejection of missing and non-finite split values, while the dispatch test should cover propagation of a valid one. Verify the handler test and the diff-scoped checks.
