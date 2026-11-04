<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Correct the tab-plugin changelog's v2 history: `openConnection` and the reply `line` are v3 additions, and the client capability count is 27, not 28.

Existing Issue: `documentation/developer-documentation/tab-plugins.md` places `openConnection` and the optional `line` in the v2 paragraph and adds a v2 bullet claiming twenty-eight client capabilities, while the same page's v3 section and the shipped `TabPluginClientCapabilities` contain twenty-seven members; `product/specs/tab-plugins.md`'s API v2 section repeats the same misattribution. Severity: 4/10

Existing Risk: 5/10 - A plugin author targeting v2 implements or expects a capability and reply field that did not exist in that contract, and the contradictory v2/v3 counts make the deprecation and compatibility guidance untrustworthy.

Proposal Risk: 1/10 - The history and current counts agree with the code; no runtime behavior changes.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1916 "fix the v2/v3 tab-plugin API history and counts". In `documentation/developer-documentation/tab-plugins.md`, move the `openConnection(row)` and background-reply `line` sentences out of the v2 paragraph and remove the "Twenty-eight client capabilities" bullet; restore the v2 section to its historical contract: twenty-seven client members, `launchShellHere()` present, and no `openConnection` or `line`. Add those two additions to the v3 changelog and migration bullet. In `product/specs/tab-plugins.md`, move the same two sentences from the API version 2 section to API version 3 and leave v2 describing only its historical additions. Extend `src/plugins/documentation.test.ts` to assert that the v2 section does not mention `openConnection` or `line` and that only the v3 section carries the current forty-eight server / twenty-seven client counts, then run the documentation test. No source behavior changes.


* Surface a refused record-tab Cancel, Close session, Terminate, or Delete action instead of silently ignoring a stale status or owner.

Existing Issue: The record-tab controls send id-only intents, and `src/plugins/connections-topic-actions.ts` silently ignores a status or owner mismatch for cancel, closeSession, terminate, and delete, so the inline `role="alert"` promised for a refused control action never appears unless the intent itself rejects; the UI cannot cause that rejection for a valid id. Severity: 3/10

Existing Risk: 3/10 - A control can appear to do nothing when the record moved on, leaving the reader unable to tell whether the action failed or the control was stale; the plan and connection-tab spec promise an error surface that is effectively unreachable.

Proposal Risk: 1/10 - The topic returns a domain error only for lifecycle refusals, the plugin rejects it, and the existing controller alert displays it; no record state changes on failure, and successful actions keep their asynchronous settlement.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1916 "surface refused record-tab lifecycle actions". In `src/plugins/connections-topic-actions.ts`, return a concise error string for a cancel or closeSession on a record whose status is not eligible, for an owner tab that no longer carries the record, for a terminate whose linked run is no longer live, and for a delete of an open or missing record; keep the existing no-op behavior for live-row open/close stale targets and for open-record lookups. In `src/plugins/connections/activate.ts`, have `recordAction` propagate the returned string through `capabilities.rejectRequest`, and leave `load`/`loadOlder` returning undefined. Cover the refusal paths in `src/plugins/connections-topic.test.ts`, `src/plugins/connections/activate.test.ts`, and `web/src/plugins/connections/ConnectionTab.test.tsx`, asserting the record is unchanged and the alert shows the message. Update `product/specs/connections-tab.md` to distinguish a refused lifecycle control from a stale live-row target; keep current no-op semantics for the latter.
