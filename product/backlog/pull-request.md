<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Correct the disabled-command step to stop expecting a notification the default settings suppress

Existing Issue: The description's step 21 expects a `command-disabled` notification to appear, but a refusal only raises the event, and `shouldNotify` drops it for the active tab and because the default `notifications.events.commandDisabled` is off; the app shows exactly `Command is disabled: file read.` with no toast and no feed line. Severity: 2/10

Existing Risk: 1/10 - A reviewer following the step looks for a notification that the default configuration never shows and may report the feature as broken.

Proposal Risk: 1/10 - The corrected wording could still misstate when the event becomes visible, but its main assertion is the exact command output, which is stable.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1992 "Correct the disabled-command notification expectation". Step D21 (description) should read: "In the Commands tab, turn off Enabled: file read. In the shell tab, type `file read notes/sample.md` and press Enter. Expect exactly `Command is disabled: file read.` The refusal raises the command-disabled event, but under the default configuration (`notifications.events.commandDisabled` is off and the shell tab is the active tab) no notification is displayed. Turn Enabled: file read back on afterwards." Observed on e246c9b6, twice: the output line is exact, `toasts` is empty, and the notifications feed is empty. Root cause: `refuseDisabledCommand` in `src/native-commands/dispatch-policy.ts` calls `notify`, satisfying the plan's "raises the local command-disabled notification", but `shouldNotify` in `src/notifications/index.ts` returns false when the tab is active and when the ambient `commandDisabled` toggle is off; `.janissary/config.json` defaults that toggle to false. The description's word "appears" is the error, not the implementation. Likely fix: correct the step's wording in the description as above; no code change. Regression test: none beyond the step's exact-output assertion; if one is wanted, assert that a disabled typed `file read` returns `Command is disabled: file read.` and does not change notification state under defaults.
