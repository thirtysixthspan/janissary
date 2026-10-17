<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Wait for post-failure output before asserting script continuation.

Existing Issue: The execution driver waits for the first runscript marker and immediately reads the transcript for `later-line`, although the queued `pwd`, `false`, and final `printf` commands may not have run yet. Severity: 4/10

Existing Risk: 4/10 - Normal scheduling or browser timing can make the driver fail intermittently even when the shell correctly continues after a failed command, reducing confidence in the integration result.

Proposal Risk: 2/10 - Waiting for the later output before reading the transcript removes the race while still failing when queue processing stops after `false`.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1729 "wait for later script output before checking continuation". In `scripts/e2e/system-schedules-execution.mjs`, wait on the visible system-shell locator for the exact `later-line` output, with a bounded timeout, before capturing `textContent()` and asserting both the marker and continuation. Keep the `false` line between the marker and `later-line` so the assertion continues to verify that a failed command does not stop subsequent script lines.


* Prove the keyed deletion leaves one of the two original schedule keys.

Existing Issue: The management driver asserts that the remaining key differs from at least one original key, so a newly generated or otherwise unexpected key still passes instead of proving the undeleted schedule retained its identity. Severity: 4/10

Existing Risk: 4/10 - A regression that recreates a duplicate under a different key or removes the wrong row can pass the browser check, weakening its verification of keyed deletion.

Proposal Risk: 2/10 - Comparing the persisted survivor to the original key for the unselected row makes an identity regression fail in the real aggregate UI path.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1729 "assert the original key survives aggregate row deletion". In `scripts/e2e/system-schedules-management.mjs`, capture the two persisted keys and identify which duplicate is selected from its rendered schedule specification before pressing Delete. After confirming deletion, assert that the store contains exactly the other original key, not merely a key unequal to one of the originals. Keep the existing rendered-row and tab-owned-row checks; the schedules plugin tests in `web/src/plugins/schedules/SchedulesTab.test.tsx` already pin that Delete sends the selected system row's key.


* Verify aggregate clear-all remains empty after an ordinary restart.

Existing Issue: The management browser driver checks clear-all in the live process but does not restart the app and verify the cleared aggregate state remains empty, despite plan 16 requiring the clear-all scenario to include restart coverage. Severity: 5/10

Existing Risk: 4/10 - A clear operation that appears successful in memory but is not durably persisted can pass the browser check and restore schedules on the next launch.

Proposal Risk: 2/10 - Reopening the same scratch project after a normal restart and checking the persisted empty store and retained runscript catches a failure to persist the aggregate clear.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1729 "verify aggregate clear-all across ordinary restart". Extend the management scenario across the existing two-batch restart lifecycle used by `scripts/e2e/system-schedules-restart.mjs`: after the aggregate Clear all schedules action, assert both owners are empty and the runscript remains, close the browser batch, relaunch the same scratch project through the ordinary launcher, then run a second browser batch and assert the aggregate remains empty and the script still exists. Keep the current persisted-store assertion and use the existing storage integration coverage for repeated clear/reload behavior as complementary non-browser coverage.
