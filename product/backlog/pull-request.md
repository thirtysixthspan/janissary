<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Functionality: bind each live connection row's open, close, and lookup to the row's owning tab, not the first row with the same kind and id.

Existing Issue: Two tabs that both hold a shell connection produce list rows with the same kind and id, while the list sends only kind and id and both the plugin intent resolver and lookup select the first matching row, so opening or closing the second row acts on the first tab. Severity: 7/10

Existing Risk: 7/10 - A user can close or focus another tab's shell, ACP terminal, or browser connection and receive a notification naming a tab they did not act on.

Proposal Risk: 2/10 - The row's owner becomes validated data instead of an implicit first match, so stale owners are rejected without widening focus beyond a current row.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1916 "bind live connection row actions and lookup to their owner". Extend the live-row `open` and `close` intents in `src/plugins/connections/shared.ts` and their guards to carry the row's `ownerLabel`; update `web/src/plugins/connections/ConnectionList.tsx` and `web/src/plugins/connections/useConnectionsController.ts` to send it; and make `src/plugins/connections/activate.ts` match kind, id, and owner before forwarding the topic action. In `src/plugins/connections/lookup.ts`, prefer the invoking tab's own live row for a `<kind>:<id>` target before another owner's row, and keep record UUID and `open-record` resolution unchanged. The command grammar, current-row server validation, and `connections close` notifications must stay untouched. Extend `src/plugins/connections/shared.test.ts`, `activate.test.ts`, `command.test.ts`, `lookup.test.ts`, `web/src/plugins/connections/ConnectionList.test.tsx`, and the controller/topic tests with two tabs exposing the same shell id: the second row must open and close the second tab while the first tab stays open, and an invented owner must be a no-op. Update `product/specs/connection.md` and `product/specs/connections-tab.md` only where they describe action ownership and lookup preference.


* Functionality: give connections-list rows a unique identity that includes their owner so duplicate shell rows cannot collide.

Existing Issue: The React key and the selection and order identity for a list row are built from type, kind, and id only, so two tabs' shell rows with the same `shell:<name>` identity collide in the same list. Severity: 5/10

Existing Risk: 5/10 - React can reuse one row's DOM and state for another, and a two-click confirmation can survive a same-length reorder and open the wrong owner's row.

Proposal Risk: 2/10 - Including the captured owner in the identity makes each rendered row distinct, though the server must still reject a stale owner on the action.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1916 "give connections-list rows a unique owner-aware identity". Add `ownerLabel` to `connectionRowIdentity` and `connectionListOrder` in `web/src/plugins/connections/connection-list-keys.ts`, and include the same value in the JSX key built in `web/src/plugins/connections/ConnectionList.tsx`. Keep the server's supplied row order and the existing two-click behavior unchanged. Extend `web/src/plugins/connections/connection-list-keys.test.ts` and `ConnectionList.test.tsx` with two live shell rows that share an id but have different owners, then reorder or replace the rows while keeping the same length and assert a stale confirmation does not open the other row. Keep record rows keyed by their UUID and SQLite rows keyed by their unique database id; this change is identity plumbing only and must not sort, merge, or deduplicate rows on the client.


* Functionality: keep keyboard activation of a list row's Close, Delete, and confirmation controls from opening the row.

Existing Issue: The list container handles Enter for every descendant, so a focused Close or Delete button or a confirmation dialog button also triggers the selected row's open handler and may have its own activation prevented. Severity: 6/10

Existing Risk: 6/10 - Keyboard users can open a record while trying to close or delete a row, or find the control does nothing, producing the wrong destructive action or no action.

Proposal Risk: 2/10 - Guarding the container leaves the row itself keyboard-operable and restores the button's normal Enter behavior.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1916 "keep list row controls from triggering row opening on Enter". In `web/src/plugins/connections/ConnectionList.tsx`, make the container `onKeyDown` ignore events whose `event.target` is not the container before handling navigation or Enter, or stop `onKeyDown` propagation on the row action buttons and the confirmation dialog wrapper. Preserve Enter on the focused row container and Space on buttons. Extend `web/src/plugins/connections/ConnectionList.test.tsx` with Enter on a focused Close button, Enter on a focused Delete button, and Enter on the Delete or Cancel button in the confirmation dialog; each must perform only its own action and must not emit the row `open` intent. Keep the existing keyboard navigation and two-click tests unchanged, and do not alter the dialog's own focus behavior.


* Plan fidelity: match a running agent row in the caller popup to the caller tab's incarnation, not only its label.

Existing Issue: `src/connection/manager.ts` includes any live run whose caller label matches, without comparing the run's captured incarnation to the open tab's runtime incarnation, so a run from a closed tab can appear under a new tab that reused its label. Severity: 5/10

Existing Risk: 5/10 - The new tab can open a record that belongs to another tab's run and shows an Agent row it did not start.

Proposal Risk: 2/10 - Comparing the existing incarnation metadata closes the stale-label path without changing run ownership or the record format.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1916 "match caller popup agent rows by incarnation". In `src/connection/manager.ts`, make `activeAgentRows` look up the caller with `managers.tab.byLabel(label)` and include a run only when `run.caller.incarnation` equals that tab's `runtime.incarnation`; skip a missing tab or mismatched incarnation. Keep the existing outcome and record-id filters, the `Agent: <task filename>` text, and the no-acpRef shape. Add a case to `src/connection/manager.test.ts` with two runs, one caller incarnation matching the live tab and one from a previous incarnation of the same label, and assert only the matching row appears; keep the existing close-caller coverage in `src/agent/manager.test.ts`. Update `product/specs/agent-command.md` or `product/specs/connections-tab.md` only if their popup ownership wording needs the incarnation rule.


* Functionality: preserve the reader's place when older connection history arrives after streamed activity.

Existing Issue: `web/src/plugins/connections/useConnectionHistoryScroll.ts` treats any content-key change as the arrival of older blocks, so a streamed activity update between a top-page request and the response consumes the saved scroll height and clears the viewport restoration. Severity: 4/10

Existing Risk: 4/10 - A reader paging an active record can have the viewport jump when the older blocks arrive instead of keeping their place.

Proposal Risk: 2/10 - Keying restoration on the window offset separates a prepend from ordinary streamed growth while retaining the existing bottom-follow rule.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1916 "preserve connection history viewport across streamed updates". In `web/src/plugins/connections/useConnectionHistoryScroll.ts`, record the requested window offset (or a dedicated request token) when a top-page request starts and apply the saved height delta only when that offset changes; a content-key change at the same offset must continue to use the existing follow and threshold behavior without clearing the pending restoration. Keep the rejection path that clears the request guard, and do not change the 40px follow threshold or the server window size. Add a case to `web/src/plugins/connections/useConnectionHistoryScroll.test.tsx` that requests older blocks at the top, inserts a growing latest activity entry before the older window arrives, then verifies the viewport is preserved and does not jump to the bottom. Retain the existing inactive-view, page-deduplication, rejection-retry, and scroll-restoration cases.


* Technical debt: remove stale references to the deleted connection parser and `ConnectionManager.run`.

Existing Issue: `src/connection/close.ts` and `src/browser/command.ts` still direct readers to the deleted `ConnectionManager.run` close path and `src/connection/parsing.ts` parser, and `product/specs/acp.md` still calls the shell's error output a `response entry` after the response panel was removed. Severity: 2/10

Existing Risk: 2/10 - A future change can follow a dead path or reintroduce a panel-shaped contract that no longer exists.

Proposal Risk: 1/10 - Correcting the comments and the one stale spec term carries no runtime behavior.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1916 "remove stale connection and ACP panel references". In `src/connection/close.ts`, change the comment to name `ConnectionManager.closeTarget` and the connections plugin command instead of the removed `ConnectionManager.run`; in `src/browser/command.ts`, point the parser reference at `src/plugins/connections/parse.ts`. In `product/specs/acp.md`, replace the sentence that says prompt errors appear in a `response entry` with wording that names the settled shell background reply and the record block. Do not change code behavior, tests, the command grammar, or the history in completed plans. Run the documentation assertions and diff-scoped checks once the wording is corrected.


* Description fidelity: replace the plan-only pull request description with the delivered feature, its verification, and its limitations.

Existing Issue: The body still describes the initial publication of seven Markdown plans in one commit and says no implementation, tests, specs, API change, screenshots, or manual feature behavior exists, while the head has 47 commits and 251 changed files including records, ACP and agent feeds, cancellation, the connections topic, plugin UI, shell integration, tests, specs, and API v3. Severity: 9/10

Existing Risk: 9/10 - Reviewers can approve or merge on a false scope and never see the security, compatibility, and manual-verification work that actually landed.

Proposal Risk: 2/10 - The description will match the branch, while the unexercised manual scenarios remain a separate limitation that must be stated rather than hidden.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1916 "rewrite the stalled plan-only pull request description". Use the pull request editing route available to that task, not this review, to replace the title and body with the delivered feature. Describe the record store and retention, ACP and agent feeds, local and remote cancellation, the coalesced connections topic and catalog/actions, the plugin-owned list and record tabs, asynchronous shell replies and popup opening, API v3, and the specs/docs/tests that shipped. Remove every initial-publication claim: the seven-file, 307-line, one-commit status; the statement that no implementation exists; the pinned initial SHA; the statement that all drafts remain initial; and the instruction to verify only the plan publication. Link the source and subplans under `product/plans/complete/` and use the current head rather than the initial SHA. Replace Setup and How to verify with application steps for a scratch project: async shell prompt plus intervening command and cancellation, connections list navigation and duplicate-looking rows, record history and paging, close/delete confirmation, agent run Terminate, restart recovery, and remote cancel. Add screenshots or state honestly that none were captured, and record the manual verification status and resource blockers from the 07 ledger. Keep the pull request open and use a Conventional Commits title; add no AI attribution anywhere.


* Plan fidelity: complete and record the manual acceptance scenarios that the completed 07 plan still lists as unexercised.

Existing Issue: The completed 07 plan says completion requires evidence for every requirement-map row and manual scenarios M1 through M8, but its own ledger records M1, M2, and M6 as partial and M3, M4, M5, and M7 as not exercised, with no browser or remote-host evidence in the pull request. Severity: 6/10

Existing Risk: 6/10 - Cancel, record-tab controls, agent Terminate, and real remote cancellation can ship broken even though all automated checks pass.

Proposal Risk: 3/10 - The work still depends on an assigned browser, authenticated provider, and a protocol-37 remote host, so the honest outcome may be a recorded blocker rather than a pass.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1916 "complete the feature's manual acceptance ledger". Run the M1 through M8 scenarios in `product/plans/complete/connections-tabs-07-specs-docs-integration.md` against a server built from this workspace, using an isolated scratch project, an assigned browser, authenticated provider access, and a reachable SSH host speaking remote protocol 37. Capture the exact observed result for async shell delivery, list and record navigation, record history and paging, cancel/close/questions, headed and headless agent runs, persistence/recovery/deletion, real remote cancellation, and legacy help/completion. Update the plan's verification ledger with per-scenario status, screenshots or capture paths, the production chunk names and static-closure result, and every unavailable resource; do not substitute unit tests or the stub/frame suites for the browser or real-host checks. If a required resource is still unavailable, leave the scenario explicitly blocked and do not mark the acceptance complete.
