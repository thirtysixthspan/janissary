<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Consolidate the connection-record-tab rules the new connections-tab spec restates from the connection and acp-records specs, and keep the streamed-follow nuance in one place.

Existing Issue: `product/specs/connections-tab.md` newly restates the record-tab follow behavior and the 20-block window that `product/specs/connection.md` and `product/specs/acp-records.md` already own, and its one-line version omits the rule that streamed updates to the latest activity entry keep following without a new entry. Severity: 3/10

Existing Risk: 3/10 - Two binding specs now describe the same follow and window behavior, and the newer copy is the weaker one, so a future change to history following can update one and leave the other stale.

Proposal Risk: 1/10 - Moving a paragraph and linking it changes no code, but the docs build must still resolve the wiki link.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1916 "consolidate the duplicated connection-tab follow and window rules". Decide one home for the record-tab behavior: either move the "Connection record history" paragraph from `product/specs/connection.md` into the "The connection tab" section of `product/specs/connections-tab.md` and leave a `[[connections-tab]]` pointer in `connection.md`, or trim `connections-tab.md`'s restatement to a link to `[[connection]]`. Carry the full streamed-follow rule ("streamed text updates to the latest activity entry, even when no new entry is added", verified by the completed `follow-streamed-connection-activity` repair) into whichever file owns it, and let `product/specs/acp-records.md` keep ownership of the 20-block window and paging so `connections-tab.md` links to it rather than repeating the number. Keep the popup-opening section of `connections-tab.md` as it is; that is this subplan's new promise. Verify by reading the three specs for one home per rule and by building the docs site; no code or test changes.
