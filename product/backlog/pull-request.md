<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Deliver the plan's named failed-write test assertion that the dedicated stderr line includes the formatted error message.

Existing Issue: The failed-write test checks only the fixed prefix and trailing newline of the dedicated stderr line, never that the error message from errorText follows the prefix, so a change that drops the error detail would leave the test green. Severity: 3/10

Existing Risk: 3/10 - A later refactor could replace the formatted error with a generic or empty suffix, and the single diagnostic explaining why activity logging stopped would lose its cause while CI stayed green.

Proposal Risk: 1/10 - Adding one assertion pins that errorText's output is actually emitted; the only residual risk is coupling the test to a specific OS error string, which the proposal avoids.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2201 "strengthen the failed-write test to assert the stderr line includes the error message". In src/activity-log/logger.test.ts, inside the "prints one stderr line and stops writing after a failed write" test, extend the check on the single captured stderr line so it verifies a non-empty message follows the `activity log: write failed, not logging for the rest of this run: ` prefix, for example by capturing the suffix after that prefix and asserting it is non-empty, or matching a regex that requires at least one character after the prefix and before the newline. Keep the existing checks for exactly one line, the trailing newline, and the absence of any `message bus:` line. Do not assert a literal OS error string such as ENOTDIR, which would make the test platform-dependent; the point is that errorText's output is present, not its exact wording. The other tests in src/activity-log/logger.test.ts and the preserved capture test in src/capture/execute-and-capture.test.ts pin the behavior that must not move.
