# Load older connection history when the newest window fits the viewport

**Complexity: 3/10** — one conditional and an effect restructure in one hook, one focused hook test with its harness laid out at mount, and one sentence each in the tab spec and user documentation; no UI control or window contract change.

## Goal

Let a reader on a tall viewport reach a record's older history even when the newest window is shorter than the history viewport and therefore cannot scroll, so no scroll event can ever reach the existing top trigger.

## Approach

`useConnectionHistoryScroll` today requests older blocks only from `onScroll` when `scrollTop` is `0`. A record whose newest window fits the viewport opens at `scrollTop` `0`, produces no scroll event, and has no other paging control, so its older pages stay unreachable even while `hasOlder` is true.

The hook already owns a `requestOlder` callback with the once-per-offset and rejection guards, a bottom-follow rule, and a viewport restoration branch that runs in the layout/content effect. Call that same callback from the effect when the tab is `active`, `hasOlder` is true, `offset` is defined, and `scrollHeight <= clientHeight`. Run the check after both the initial layout and the restoration branch, so restored content that still cannot scroll continues paging. Today the restoration branch returns early; turn it into the restoring arm of a branch so the fit check below it always runs, while the non-restoring arm keeps the existing height-baseline refresh and bottom-follow behavior.

A request stores the offset it was made for, and the existing effect reset clears that guard when the offset changes, so the next older window re-runs the fit check and requests again until the history becomes scrollable or `hasOlder` becomes false. Rejections still clear the guard and restoration state for a retry. `requestOlder` and `hasOlder` join the effect's dependency list.

JSDOM reports `scrollHeight` and `clientHeight` as `0`, which would look like a fitting viewport before a test applies its own metrics. Give the test mount optional initial metrics applied in a layout effect, defaulting to a laid-out taller-than-viewport scroller, so the existing cases keep their meaning and the new case can fit at mount.

## Implementation steps

1. In `web/src/plugins/connections/useConnectionHistoryScroll.ts`, make the restoration branch a conditional arm instead of an early return, keep its scroll delta and bookkeeping, keep the else arm's height-baseline refresh and bottom-follow, then run the active/`hasOlder`/defined-offset/`scrollHeight <= clientHeight` request below both arms. Add `hasOlder` and `requestOlder` to the effect dependencies.
2. In `web/src/plugins/connections/useConnectionHistoryScroll.test.tsx`, add optional initial metrics to the mount harness and apply them in a layout effect before the hook's effect; keep every existing case unchanged.
3. Add one case that mounts an active tab with `offset: 1`, `hasOlder`, and a scroller shorter than its client height, asserts one `loadOlder` call with no scroll event, rerenders with the next older window still fitting and asserts a second request, then rerenders with taller content and asserts the prepended-height restoration and bottom-follow behavior still hold without another request.
4. State in `product/specs/connections-tab.md` that older blocks also load automatically while the loaded history fits the viewport, until it scrolls or no older blocks remain.
5. Update the same paging description in `documentation/user-documentation/command-bar/connections.md`.
6. Run the focused client suite and `$janissary/scripts/run.mjs check-diff`, promote this plan, remove only the resolved backlog entry, commit, and push to the open PR branch.

## Tests

- Fitting newest window on mount with `hasOlder`: one older-page request without any scroll event.
- Next older window still fitting: the changed offset allows exactly one more request.
- Taller history: no further request, prepended-height restoration holds, and bottom-follow still lands on the newest content.
- Existing top-scroll, once-per-offset, rejection-retry, streamed-growth, inactive-view, and viewport-restoration cases continue to pass.

## Out of scope

- Adding a paging control or changing the `ConnectionTab` window contract, rendering, or transport.
- Changing the window size, offset, `hasOlder`, or server paging rules.
- Changing the bottom-follow threshold, the active-view gate, or other scroll surfaces.
- Adding documentation where no existing page describes history paging.

## Completion

- Added the fit-based automatic older-page request to the layout/content effect, after both the initial layout and the restoration arm, keeping bottom-follow, viewport restoration, top-scroll, once-per-offset, and rejection behavior.
- Added the automatic-paging case and mount-time metrics to `web/src/plugins/connections/useConnectionHistoryScroll.test.tsx`; the focused suite passes 10 of 10.
- Updated the paging sentence in `product/specs/connections-tab.md` and `documentation/user-documentation/command-bar/connections.md`.
- `$janissary/scripts/run.mjs check-diff` passed lint, typecheck, and the web tests.
- Removed only the resolved entry from `product/backlog/pull-request.md`.
- Pushed the fix to the open PR branch without AI attribution.
