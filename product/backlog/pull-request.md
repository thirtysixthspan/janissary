<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Verify that the runscript itself survives the ordinary restart scenario.

Existing Issue: The restart driver checks that the schedule entry remains in the store after relaunch but never checks that `restart-probe.rs` remains available or can still be executed. Severity: 4/10

Existing Risk: 5/10 - Startup cleanup could remove project scripts while preserving the schedule snapshot, leaving a persisted schedule that cannot run and an E2E restart check that still passes.

Proposal Risk: 2/10 - Checking the script file and executing it after relaunch verifies both retained project data and the real command path, with storage and command tests covering remaining edge cases.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1729 "verify runscript persistence across ordinary restart". In `scripts/e2e/system-schedules-restart.mjs`, after confirming the persisted `restart-check` entry, assert that `.janissary/scripts/restart-probe.rs` still exists and run `execute restart-probe`; wait for its distinctive output in the managed system shell before recording the scenario as verified. Keep the same scratch project and ordinary launcher restart flow. The existing system storage integration test covers schedule-store clear/reload behavior, while this driver should pin script retention and execution across the process boundary.


* Wait for post-failure output before asserting script continuation.

Existing Issue: The execution driver waits for the first runscript marker and immediately reads the transcript for `later-line`, although the queued `pwd`, `false`, and final `printf` commands may not have run yet. Severity: 4/10

Existing Risk: 4/10 - Normal scheduling or browser timing can make the driver fail intermittently even when the shell correctly continues after a failed command, reducing confidence in the integration result.

Proposal Risk: 2/10 - Waiting for the later output before reading the transcript removes the race while still failing when queue processing stops after `false`.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1729 "wait for later script output before checking continuation". In `scripts/e2e/system-schedules-execution.mjs`, wait on the visible system-shell locator for the exact `later-line` output, with a bounded timeout, before capturing `textContent()` and asserting both the marker and continuation. Keep the `false` line between the marker and `later-line` so the assertion continues to verify that a failed command does not stop subsequent script lines.
