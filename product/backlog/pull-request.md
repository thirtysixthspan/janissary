<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Deliver the plan's direct tests for the desktop master switch and ambient defaults.

Existing Issue: `src/notifications/native.test.ts` does not verify that `osNotifications: false` suppresses an enabled per-type banner or that an ambient event opted into the feed remains alert-free under its default alert settings. Severity: 4/10

Existing Risk: 4/10 - A later change could bypass either default gate without a regression test catching an unexpected banner or sound.

Proposal Risk: 2/10 - The master-switch and ambient-default behavior will have direct regression coverage, though unrelated delivery regressions remain possible.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1768 "add direct tests for notification alert master and ambient defaults". In `src/notifications/native.test.ts`, add an `osNotifications: false` case with an enabled `desktop: true` entry and `sound: 'none'`, asserting no native alert while the notification still reaches the queue. Add an ambient case that enables `stateChange` in `notifications.events` but retains the default `state-change` alert entry, asserting the notification reaches the queue without emitting a native alert. Keep the existing configured ambient opt-in and master-switch cases. Verify these cases in the colocated test file and preserve the queue-versus-alert distinction.
