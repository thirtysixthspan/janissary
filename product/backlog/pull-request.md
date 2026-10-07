<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Use a monotonic clock to throttle bell sounds across system time changes.

Existing Issue: `NativeNotifications` measures the one-second bell interval with `Date.now()`, so a backward clock adjustment makes every elapsed value negative until wall time catches up. Severity: 3/10

Existing Risk: 3/10 - A user whose clock steps backward while agents run can miss every attention sound for the length of that step even though desktop banners still show.

Proposal Risk: 1/10 - A monotonic browser clock still resets on page reload, when the in-memory throttle resets as well.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1575: use monotonic bell throttling". Replace the wall-clock interval in `web/src/notifications/native-notifications.ts` with a monotonic browser clock such as `performance.now()` while preserving its one-second per-client behavior and the banner's independent delivery; add a regression in `web/src/notifications/native-notifications.test.ts` that moves wall time backward after the first sound and checks the next eligible sound after one monotonic second. Run `./scripts/run.mjs check-diff` before committing and pushing the repair.
