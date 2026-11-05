<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Restore the catalog warning tests' stderr spies after each case.

Existing Issue: `src/models/catalog-file.test.ts` replaces `process.stderr.write` with a spy for invalid-override warnings but never restores it, unlike the previous tests that explicitly restored their spies. Severity: 3/10

Existing Risk: 3/10 - The stub can leak into later tests and suppress their stderr output or leave warning assertions observing calls from an earlier case.

Proposal Risk: 1/10 - Each warning test restores the process method during cleanup, so later tests see the real stream and only their own spy calls.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1935 "restore catalog warning test stderr spies". Update `src/models/catalog-file.test.ts` so the `process.stderr.write` spy used by each invalid-override warning case is restored after the case, including when an assertion fails; use `afterEach(vi.restoreAllMocks)` for the file or a `try/finally` cleanup local to those cases. Keep the invalid-JSON and malformed-record warning assertions and all catalog decoding, encoding, override, and fallback coverage. Run the required diff-scoped checks for the test-only repair.
