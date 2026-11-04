# Load older connection history after a viewport resize makes it fit

**Complexity: 3/10** — one observer effect and a latest-callback ref in one hook, one focused hook test that resizes a laid-out scroller, and one spec sentence; no `ConnectionTab` or server window change.

## Goal

Let a reader who opens a record in a short window and then enlarges it reach the record's older history once the loaded history fits the taller viewport. Today the fit check runs only when the hook's layout effect reruns after a content, offset, or active change, so a resize alone leaves the history unscrollable with no path to the older pages.

## Approach

`useConnectionHistoryScroll` already requests older blocks from its layout/content effect when `active`, `hasOlder`, `offset` is defined, and `scrollHeight <= clientHeight`. It has no element or window size observer, so nothing re-runs that check when only the viewport grows.

Keep the existing fit check and its guards as they are. Add a second effect that observes the history element's size with a `ResizeObserver`, falling back to a `window` resize listener when `ResizeObserver` is unavailable. Its callback calls the existing `requestOlder` only when `active && hasOlder && offset !== undefined && element.scrollHeight <= element.clientHeight`. The once-per-offset guard in `requestOlder` means a fitting viewport cannot loop, and a second fit notification at the same offset does not request again.

Set the observer up once per mounted element rather than reconnecting on every render: the effect depends only on `elementRef`, and a ref holds the latest fit-check callback so the observer reads current `active`, `hasOlder`, `offset`, and `requestOlder` values. Cleanup disconnects the observer or removes the window listener. The existing bottom-follow, viewport-restoration, once-per-offset, and rejection guards stay unchanged.

JSDOM has no `ResizeObserver`, so the test file exercises the window resize fallback. Mount a history taller than a short viewport, change its metrics so the same content fits, dispatch a window `resize`, and assert exactly one `loadOlder` call without a scroll event. A second fitting resize at the same offset must not request again.

## Implementation steps

1. In `web/src/plugins/connections/useConnectionHistoryScroll.ts`, add a callback that requests older history when the element fits under the current `active`, `hasOlder`, and defined `offset`, and store it in a ref updated each render.
2. Add an effect that reads the history element, observes it with `ResizeObserver` when available, or registers a `window` resize listener otherwise, and cleans up the observer or listener. Keep the existing layout/content effect and its guards unchanged.
3. In `web/src/plugins/connections/useConnectionHistoryScroll.test.tsx`, add the resize case described under Tests. Keep every existing case unchanged.
4. State in `product/specs/connections-tab.md` that older blocks also load when a resize makes the loaded history fit the viewport.
5. Run the focused client suite and `$janissary/scripts/run.mjs check-diff`, promote this plan, remove only the resolved backlog entry, commit, and push to the open PR branch.

## Tests

- A history taller than its viewport mounts without requesting older pages.
- After the viewport grows so the same history fits, one window resize requests exactly one older page without a scroll event.
- A second fitting resize at the same offset does not request again.
- Existing top-scroll, once-per-offset, rejection-retry, fitting-content, streamed-growth, inactive-view, and viewport-restoration cases continue to pass.

## Out of scope

- Changing `ConnectionTab`, its markup, or the server window contract.
- Changing the window size, offset, `hasOlder`, or server paging rules.
- Adding a paging control or changing scroll thresholds, bottom-follow, or restoration behavior.
- Updating user documentation, which already describes automatic paging while the history fits the tab.

## Completion

- Added a `ResizeObserver` effect with a `window` resize fallback and a latest-callback ref to `web/src/plugins/connections/useConnectionHistoryScroll.ts`; it requests older history when a resize leaves an active, paged record's loaded history fitting its viewport, and the existing once-per-offset and rejection guards still prevent repeats.
- Added the resize case to `web/src/plugins/connections/useConnectionHistoryScroll.test.tsx`; the focused suite passes 11 of 11.
- Updated the paging sentence in `product/specs/connections-tab.md`.
- `$janissary/scripts/run.mjs check-diff` passed lint, typecheck, and the web tests.
- Removed only the resolved entry from `product/backlog/pull-request.md`.
- Pushed the fix to the open PR branch without AI attribution.
