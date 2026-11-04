<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Plan fidelity: record the commits after 7e42ec0b in the 07 verification ledger.

Existing Issue: The corrected 07 ledger names later commits only through 7e42ec0b, while 2f8782d4 changed the web history hook and its test plus the Connections guide and connections-tab spec, 5f226510 changed the guide and spec, and 1a6ee959 changed the connections topic action and its test, so the current head still has later client and server production changes whose coverage the ledger never names. Severity: 4/10

Existing Risk: 4/10 - A reviewer reads the ledger as the complete later-commit accounting for the evidence it scopes to dc491bd5 and misses that the current head's web hook and topic action are covered only by their focused tests, which is the same staleness the correction was written to remove.

Proposal Risk: 2/10 - The ledger will name every post-dc491bd5 source, test, and documentation change and state the historical evidence scope accurately, but the build, docs, and suite results remain historical unless they are rerun.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1916 "name every later commit in the 07 verification ledger". In `product/plans/complete/connections-tabs-07-specs-docs-integration.md`, extend the "Verification resources and evidence ledger" paragraph and the "Implementation SHA and help/keys repair", "Documentation seam", "Docs build", and "Production lazy graph" rows to name `2f8782d4` (the `web/src/plugins/connections/useConnectionHistoryScroll.ts` and `.test.tsx` change plus the Connections guide and connections-tab spec), `5f226510` (the guide and spec wording), and `1a6ee959` (the `src/plugins/connections-topic-actions.ts` and `src/plugins/connections-topic.test.ts` change); state that the later client hook change is covered by its focused hook test and the later server change by the topic test, and that the dc491bd5 build, docs, and suite evidence remains historical with no later rerun. Keep every manual-scenario result, the M7 blocked row, the source-report caveat, and the no-full-pass statement unchanged; do not rerun builds or suites for this correction; do not change production, test, spec, or user-documentation files.


* Plan fidelity: align the canonical plan's record-tab Terminate presentation with the delivered hide-at-terminal UI.

Existing Issue: `product/plans/complete/connections-tabs.md` decision 22 still says the record-tab Terminate "is disabled once cleanup begins", while `web/src/plugins/connections/ConnectionTab.tsx` renders the control only while the run is `Running`, disables it on the click, and removes it when the record reports `Completed`, `Failed`, or `Terminated`, and the current spec and user guide describe that hide-at-terminal behavior plus the monitor's separate visible disabled control. Severity: 3/10

Existing Risk: 3/10 - The canonical design record disagrees with the delivered UI and the current spec, so a later reader or a future control change can follow the obsolete disabled-through-cleanup expectation and treat the hide-at-terminal behavior as a regression.

Proposal Risk: 2/10 - The presentation sentence will match the delivered and documented behavior, but the file is a completed historical plan, so the edit must stay limited to that sentence and must not move the action semantics or the 8/10 rating.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1916 "align the canonical plan's record-tab Terminate presentation with the delivered UI". In `product/plans/complete/connections-tabs.md` decision 22, replace "is disabled once cleanup begins" with the delivered presentation: the record tab disables the control from the click until the record reports a terminal status and then removes it, while the agent monitor's own Terminate stays visible and disabled through cleanup. Keep "acts exactly like the agent-monitor's Terminate", the action semantics, the 8/10 rating, and every other line unchanged. Cross-check the sentence against `web/src/plugins/connections/ConnectionTab.tsx` (`canTerminate` and `pendingTerminate`), `web/src/plugins/agent-monitor/view.tsx`, and the already-corrected `product/specs/connections-tab.md` and `documentation/user-documentation/command-bar/connections.md`. Do not change code, tests, the spec, the guide, or any other plan; `web/src/plugins/connections/ConnectionTab.test.tsx` already pins the in-flight disable, rejection reset, and terminal removal.


* Plan fidelity: state that a record with no older blocks keeps its current window, not only an empty one, and pin the non-empty case.

Existing Issue: `product/specs/connections-tab.md` says a record with no older blocks "keeps its current empty window", but a record with between one and twenty blocks has `hasOlder: false` and a non-empty window, and `loadOlder` returns unchanged for it too, so the sentence describes only the zero-block case and misstates the general no-older behavior while `src/plugins/connections-topic.test.ts` covers only the zero-block record. Severity: 2/10

Existing Risk: 2/10 - A future reader or test author can implement or assert a zero-block-only special case, and a regression that clears or truncates a short record's window on `loadOlder` would not be caught by the current coverage.

Proposal Risk: 1/10 - The sentence will describe the general no-older rule and the new test will pin the short-window no-op, with the zero-block throw regression case unchanged.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1916 "correct the no-older loadOlder wording and cover a non-empty short window". Replace "keeps its current empty window" in `product/specs/connections-tab.md` with wording that a record with no older blocks keeps its current window, including the empty window of a zero-block record. In `src/plugins/connections-topic.test.ts`, add a case using a record with a small non-empty block list whose `recordWindow` reports `hasOlder: false`; after `load`, call `loadOlder` twice and assert `readConnectionsTopic` still returns the same blocks, `totalBlocks`, `offset: 0`, and `hasOlder: false`, and that every `window` call for that record uses `ACP_RECORD_WINDOW_SIZE`. Keep the existing zero-block, multi-block paging, reset, and window-release cases unchanged; do not change `src/plugins/connections-topic-actions.ts` or the recorder.


* Description fidelity: refresh the pull request body's head counts, paging text, and pinned spec and ledger links after the later fixes.

Existing Issue: The body still says the branch carries 78 commits and 278 changed files from `139aaf43` while the head carries 84 and 283, its record-tab paragraph and "Record history and paging" step do not mention automatic older-history loading while the loaded history fits, and its pinned `37324fd4` links for `product/specs/connections-tab.md` and the 07 plan open versions that still show the old Terminate and paging wording and the pre-correction ledger claim. Severity: 4/10

Existing Risk: 4/10 - A reviewer follows the body's own source links and reads the superseded behavior and evidence, so the description, its linked spec, and its linked ledger disagree and the review can approve or report against stale wording.

Proposal Risk: 1/10 - The body and its links will match the branch and the corrected spec and ledger, with no code or behavior change.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1916 "refresh the pull request body's counts, paging text, and pinned links". Update the "As of this head" sentence to the current commit and changed-file counts, add the automatic older-history loading to the "Plugin-owned list and record tabs" record-tab paragraph and to the "Record history and paging" verification step (noting that a tall viewport may load older blocks before the reader scrolls and that a record with enough blocks still requires the top-scroll check), and repoint the links in "Specs, docs, and tests" and "Source plan and subplans" for `product/specs/connections-tab.md` and `product/plans/complete/connections-tabs-07-specs-docs-integration.md` (and any other link whose file changed) at the current head or the relevant fix commits. Confirm each linked file at the pinned SHA shows the corrected Terminate and paging wording and the corrected ledger scope; keep the manual acceptance table, the M7 blocked row, and every other paragraph byte-for-byte. Do not change code, tests, specs, plans, or user documentation.


* Functionality: load older history when a resize makes the loaded history fit the viewport.

Existing Issue: `web/src/plugins/connections/useConnectionHistoryScroll.ts` evaluates the fit condition only when its effect runs after a content, offset, or active change; it has no element or window size observer, so a record opened in a short window that later grows tall enough for the loaded history to fit stops offering the older pages and never issues `loadOlder`.

Existing Risk: 3/10 - A reader who opens a record in a small window and then maximizes it sees no scrollbar and cannot reach the older blocks, which is the same trap the fix removes for a reader who starts on a tall display.

Proposal Risk: 2/10 - A size observer will request one older page when the element becomes tall enough, with the existing once-per-offset and rejection guards preventing repeats, but it adds a DOM observer and a test harness that must not loop while the page still fits.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1916 "load older connection history after a viewport resize makes it fit". In `web/src/plugins/connections/useConnectionHistoryScroll.ts`, observe the history element's size with a `ResizeObserver` in an effect (falling back to a window resize listener when `ResizeObserver` is unavailable) and call the existing `requestOlder` when `active && hasOlder && offset !== undefined && element.scrollHeight <= element.clientHeight`; set up the observer once and read the latest `requestOlder` from a ref so it does not disconnect and reconnect on every render, disconnect it and remove the listener on cleanup, and keep the existing bottom-follow, viewport-restoration, once-per-offset, and rejection guards unchanged. Add a case to `web/src/plugins/connections/useConnectionHistoryScroll.test.tsx` that mounts a taller-than-viewport history, changes the metrics to a fitting viewport, triggers the resize path, and asserts exactly one `loadOlder` call without a scroll event; a second fitting update at the same offset must not request again. Keep every existing case unchanged and do not change `ConnectionTab` or the server window contract.
