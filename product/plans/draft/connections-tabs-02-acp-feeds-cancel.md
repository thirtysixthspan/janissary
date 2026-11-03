# ACP and agent record feeds, cancellation, and remote forwarding

**Complexity: 5/10**

## Goal

Feed each tracked core-tab ACP session and every `agent ... execute` run into durable connection records, including activity and final outcomes, and provide an ACP cancel path that works locally and remotely.

## Decisions and dependencies

- Covers source-plan requirements 6, 9–12, 17, 21–22, 28, 30, and the record ownership/lifecycle portions of 27 and 35; tests listed for ACP, agent, and remote protocol changes.
- Depends on `product/plans/draft/connections-tabs-01-records.md` for record APIs and id ownership. No dependency on topic or plugin plans.
- Track every core tab ACP session regardless of initiating tab, plus agent execute runs (headed and headless). Do not track conversations, monitors, or editor persona sessions.
- Cancellation preserves the ACP session and settles its pending prompt with `ACP: prompt cancelled.`. Reset/Close session still closes the session and aborts the active question/tool loop through existing settlement paths.
- Remote cancellation uses a new `acp-cancel` client frame and the required remote protocol version bump to 37.

## Existing code to reuse

- `AcpSessionManager`/`AcpManager` lifecycle and `settleAcpPrompt` in `src/acp/`; `acpActivity` in `src/acp/activity.ts`.
- Existing `connectAcp` activity callback, `run.reportActivity` in `src/agent/execute.ts`, and run settlement in `src/agent/settle-run.ts`.
- Existing `acp-activity` frame and routing in `src/remote/serve-acp.ts`, `src/remote/protocol-frames.ts`, and `src/remote/channel/acp.ts`.

## Proposed changes

- Add `src/acp/record-feed.ts` and have `AcpManager` delegate record lifecycle there so its current file stays within the 200-line limit. Begin on the core tab session handshake when `managers.acp.label(label)` becomes available, store the id on the tab runtime, record prompts/activity/answers, and close once for reset, tab close, fatal failure, plugin failure, or shutdown.
- Normalize local raw ACP updates through `acpActivity`; accept remote activity already classified as `(kind, text)`. Both transports use the same record feed.
- Begin a record when an agent run is created, record the activity beside `run.reportActivity`, and close with the settled `Completed`, `Failed`, or `Terminated` result. Preserve the task filename and caller popup linkage required for a run record.
- Add `AcpManager.cancel(label)` and a `cancel()` session method that sends SDK `connection.cancel({ sessionId })`, aborts prompt/tool/question work, and settles as cancelled without dropping the session. A second in-flight prompt remains refused; no queue is introduced.
- Forward remote cancel through `acp-cancel`, decode/validate it, route it to the far-side ACP session, and bump/check the remote protocol version.

## Tests

- Extend `src/acp/manager.test.ts` and `src/acp/plugin-session.test.ts` for handshake record creation, prompt/activity/answer, reset/tab-close/fatal-close, question abort and cancellation settlement, and duplicate-prompt refusal.
- Extend `src/agent/execute.test.ts` for activity and all terminal outcomes.
- Extend `src/remote/serve-acp.test.ts` and remote protocol tests for frame admission, far-side delivery, and version 37.

## Verification

- Run diff-scoped lint, typecheck, and related server tests.
- Exercise local and remote cancel paths and verify the same session accepts a later prompt after cancellation.

## Out of scope

- Persisted record model/storage details (subplan 01), notification topic/UI delivery, shell background replies, or connections commands.
- Tracking other ACP consumers or retaining activity history for non-ACP connections.
- Changing agent-monitor lifecycle or remote sessions-tab behavior.
