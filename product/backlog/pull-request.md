<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Restore the space after the equals sign in the driver tests' event filter helper, which the driver cancellation commit removed by accident while adding the pending-host helpers beside it.

Existing Issue: The driver cancellation commit rewrote the otherwise unchanged `ofKind` declaration in the driver tests as `const ofKind =(events …`, a formatting change with no behavioural purpose that no lint rule catches because the project's ESLint config defers formatting to Prettier, which only runs on demand. Severity: 1/10

Existing Risk: 2/10 - The next `npm run format` silently rewrites the line, adding an unrelated hunk to whatever later change runs it and making that diff harder to review.

Proposal Risk: 1/10 - A single whitespace restoration in a test file; if it went wrong the driver tests would fail to parse and the diff checker would show it at once.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1992 "restore the space after the equals sign in the ofKind helper of the driver tests". In `src/acp/drive-loop.test.ts`, change the module-level `const ofKind =(events: unknown[][], kind: string) => events.filter((event) => event[0] === kind);` back to `const ofKind = (events: unknown[][], kind: string) => events.filter((event) => event[0] === kind);`, exactly as it read before the driver cancellation commit, and change nothing else in the file. Verify with `$janissary/scripts/run.mjs check-diff`: the `describe('driveToolLoop', …)` and `describe('runToolLoop', …)` tests in that file, including the three cancellation tests built on `drivePending`, must all still pass, and `git diff` must show only that one line.
