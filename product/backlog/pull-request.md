<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Make desktop alerts for docked tabs focus the right sidebar entry and stay silent while that entry is focused.

Existing Issue: A banner from a docked file navigator sends `focusTab` on click, which the server ignores for docked tabs, and the alert service treats the centre tab as focused even when the originating docked tab is the selected sidebar entry. Severity: 6/10

Existing Risk: 5/10 - An alert can interrupt someone already looking at its docked tab, then fail to bring them back to that tab when clicked after they switch sidebar entries.

Proposal Risk: 2/10 - Sidebar selection and centre focus can change between delivery and click, but querying current placement at click time avoids a stale-target switch.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1575: support focus-aware desktop alerts for docked tabs". `web/src/notifications/native-notifications.ts` sends `focusTab` for every banner and compares only the centre active label; `src/tab/navigation-commands.ts` refuses to activate a docked tab, while `web/src/useSidebarSelection.ts` holds sidebar selection locally. Coordinate per-client visible sidebar selection through the app layer, not a cross-feature import, so an alert from a focused, selected docked tab is suppressed and a click selects and focuses its owning sidebar entry without undocking it. Keep ordinary centre-tab click behavior, add tests for both docked and centre cases in `web/src/notifications/` and the sidebar selection tests, and run `./scripts/run.mjs check-diff` before committing and pushing the repair.


* Release desktop banners and their click handlers when the notification client is disposed.

Existing Issue: `NativeNotifications.dispose` pauses sounds but leaves browser notifications and their click listeners alive with a reference to a client that the page lifecycle can dispose and replace. Severity: 4/10

Existing Risk: 4/10 - Clicking a retained banner after a back-forward cache restore sends `focusTab` through a closed WebSocket and does not focus the requested tab.

Proposal Risk: 1/10 - Closing only notifications owned by the disposed service leaves current client banners intact but an OS may have already dismissed one independently.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1575: release native notifications on client disposal". Track the notifications created by `web/src/notifications/native-notifications.ts` together with their click lifetimes, close and release them in `dispose`, and ignore late clicks after disposal; keep the audio cleanup already there. Verify with a client test that creates a banner, disposes the service, simulates a late click, and asserts the old client sends no RPC, alongside a normal click test. Check the `web/src/client-page-lifecycle.ts` persisted-page replacement path without modifying it unless testing proves necessary; run `./scripts/run.mjs check-diff` before committing and pushing the repair.


* Use a monotonic clock to throttle bell sounds across system time changes.

Existing Issue: `NativeNotifications` measures the one-second bell interval with `Date.now()`, so a backward clock adjustment makes every elapsed value negative until wall time catches up. Severity: 3/10

Existing Risk: 3/10 - A user whose clock steps backward while agents run can miss every attention sound for the length of that step even though desktop banners still show.

Proposal Risk: 1/10 - A monotonic browser clock still resets on page reload, when the in-memory throttle resets as well.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1575: use monotonic bell throttling". Replace the wall-clock interval in `web/src/notifications/native-notifications.ts` with a monotonic browser clock such as `performance.now()` while preserving its one-second per-client behavior and the banner's independent delivery; add a regression in `web/src/notifications/native-notifications.test.ts` that moves wall time backward after the first sound and checks the next eligible sound after one monotonic second. Run `./scripts/run.mjs check-diff` before committing and pushing the repair.
