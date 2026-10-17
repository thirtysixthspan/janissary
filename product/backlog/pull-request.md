<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Handle the hidden shell before waiting for visible post-restart script output.

Existing Issue: The restart driver executes the retained runscript but waits for its marker in a visible system-shell locator without revealing the shell, even though `execute` only enqueues lines and the shell starts hidden after launch. Severity: 6/10

Existing Risk: 5/10 - The restart E2E scenario times out on the normal hidden-shell startup path and cannot verify that the preserved script executed after relaunch.

Proposal Risk: 2/10 - Explicitly focusing the managed system shell before waiting makes the assertion observe its retained output, with the existing execution scenario already using that reveal path.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1729 "reveal system shell before post-restart output assertion". In `scripts/e2e/system-schedules-restart.mjs`, after `execute restart-probe`, run `tab focus system` before locating the visible `.tab-body[data-tab-label="system"]` and waiting for `restart-script-preserved`. The `execute` command in `src/commands/execute.ts` ensures the shell and queues lines but does not reveal it; compare `scripts/e2e/system-schedules-execution.mjs`, which explicitly focuses `system` after execution before observing output. Keep the runscript existence and persisted schedule assertions in the restart scenario.
