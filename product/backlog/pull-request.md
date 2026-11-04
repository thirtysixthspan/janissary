<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Functionality: load older history when a resize makes the loaded history fit the viewport.

Existing Issue: `web/src/plugins/connections/useConnectionHistoryScroll.ts` evaluates the fit condition only when its effect runs after a content, offset, or active change; it has no element or window size observer, so a record opened in a short window that later grows tall enough for the loaded history to fit stops offering the older pages and never issues `loadOlder`.

Existing Risk: 3/10 - A reader who opens a record in a small window and then maximizes it sees no scrollbar and cannot reach the older blocks, which is the same trap the fix removes for a reader who starts on a tall display.

Proposal Risk: 2/10 - A size observer will request one older page when the element becomes tall enough, with the existing once-per-offset and rejection guards preventing repeats, but it adds a DOM observer and a test harness that must not loop while the page still fits.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1916 "load older connection history after a viewport resize makes it fit". In `web/src/plugins/connections/useConnectionHistoryScroll.ts`, observe the history element's size with a `ResizeObserver` in an effect (falling back to a window resize listener when `ResizeObserver` is unavailable) and call the existing `requestOlder` when `active && hasOlder && offset !== undefined && element.scrollHeight <= element.clientHeight`; set up the observer once and read the latest `requestOlder` from a ref so it does not disconnect and reconnect on every render, disconnect it and remove the listener on cleanup, and keep the existing bottom-follow, viewport-restoration, once-per-offset, and rejection guards unchanged. Add a case to `web/src/plugins/connections/useConnectionHistoryScroll.test.tsx` that mounts a taller-than-viewport history, changes the metrics to a fitting viewport, triggers the resize path, and asserts exactly one `loadOlder` call without a scroll event; a second fitting update at the same offset must not request again. Keep every existing case unchanged and do not change `ConnectionTab` or the server window contract.
