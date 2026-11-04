<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

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
