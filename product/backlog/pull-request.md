<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Surface a refused record-tab Cancel, Close session, Terminate, or Delete action instead of silently ignoring a stale status or owner.

Existing Issue: The record-tab controls send id-only intents, and `src/plugins/connections-topic-actions.ts` silently ignores a status or owner mismatch for cancel, closeSession, terminate, and delete, so the inline `role="alert"` promised for a refused control action never appears unless the intent itself rejects; the UI cannot cause that rejection for a valid id. Severity: 3/10

Existing Risk: 3/10 - A control can appear to do nothing when the record moved on, leaving the reader unable to tell whether the action failed or the control was stale; the plan and connection-tab spec promise an error surface that is effectively unreachable.

Proposal Risk: 1/10 - The topic returns a domain error only for lifecycle refusals, the plugin rejects it, and the existing controller alert displays it; no record state changes on failure, and successful actions keep their asynchronous settlement.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1916 "surface refused record-tab lifecycle actions". In `src/plugins/connections-topic-actions.ts`, return a concise error string for a cancel or closeSession on a record whose status is not eligible, for an owner tab that no longer carries the record, for a terminate whose linked run is no longer live, and for a delete of an open or missing record; keep the existing no-op behavior for live-row open/close stale targets and for open-record lookups. In `src/plugins/connections/activate.ts`, have `recordAction` propagate the returned string through `capabilities.rejectRequest`, and leave `load`/`loadOlder` returning undefined. Cover the refusal paths in `src/plugins/connections-topic.test.ts`, `src/plugins/connections/activate.test.ts`, and `web/src/plugins/connections/ConnectionTab.test.tsx`, asserting the record is unchanged and the alert shows the message. Update `product/specs/connections-tab.md` to distinguish a refused lifecycle control from a stale live-row target; keep current no-op semantics for the latter.
