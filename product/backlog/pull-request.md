<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Suppress false question-withdrawn notifications from the local executor once a question has already settled.

Existing Issue: The local executor adds an abort listener that calls notify unconditionally and never removes it, so aborting the request signal after the user answered or after the tab was closed still emits a "Question from <tab> withdrawn" notification for a question that is no longer pending. Severity: 6/10

Existing Risk: 5/10 - A client disconnect or late cancellation after an answer produces a false withdrawal alert with a warning sound on an explicit event, misleading the user and polluting the notification feed for an interaction that completed normally.

Proposal Risk: 2/10 - The listener is removed once the question settles and the notify call is gated on the question still being pending, so only a genuine withdrawal before an answer notifies; the existing abort-while-pending test keeps that branch covered.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2256 "suppress false question-withdrawn notifications from the local executor". In src/mcp/executor.ts replace the inline abort callback with a named handler and a `settled` flag: the handler returns early when `settled` is true and otherwise calls `notify(managers, 'question-withdrawn', label)`, and a `try/finally` around the `await managers.questions.register({ tab: label, kind, question, options }, signal)` sets `settled = true` and calls `signal.removeEventListener('abort', onAbort)` on every settlement path. Keep the current behavior that an abort while the question is pending both cancels it through `Questions.register` and notifies exactly once, and that a user cancellation in the panel notifies not at all. In src/mcp/executor.test.ts add a case that answers a pending question with `questions.answer(...)` and then aborts the controller, asserting `deliverNotification` was not called; keep the existing "withdraws an aborted question" case asserting exactly one notification and the cancel-in-panel case asserting none. These two branches are the only behavior this changes — there is no production caller of `createLocalExecutor` yet, so no downstream consumer needs updating beyond these tests.
