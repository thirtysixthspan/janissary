<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Remove the completed deferred-allocation plan's executable verification directive.

Existing Issue: `product/plans/complete/revalidate-deferred-plugin-allocations.md` still directs readers to execute `check-diff` after each implementation step, despite recording completed work. Severity: 5/10

Existing Risk: 5/10 - A future agent following this completed plan may run project-controlled tooling outside its assigned task, which can execute repository scripts and blur the boundary between reviewed content and authorized actions.

Proposal Risk: 2/10 - Replacing the imperative command with a factual statement of the plan's recorded test coverage removes the execution prompt while leaving the implementation history clear.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1672 "remove the completed deferred-allocation plan verification directive". In `product/plans/complete/revalidate-deferred-plugin-allocations.md`, replace the `check-diff` instruction in the Tests section with a descriptive summary of the late-callback refusal and admitted-allocation cleanup coverage already named there. Re-read the full plan and `product/plans/complete/remove-operational-directives-from-reviewed-plans.md` to ensure the completed plan contains no command that directs readers to run tooling and the cleanup record no longer implies this plan's command was removed. No application tests are needed for this wording-only change; verify it by reading the complete plan and focused diff.


* Strengthen the run-owned remote retry tests to exercise the production run lifecycle.

Existing Issue: The two new retry lifecycle tests use `ownRemoteLaunches` to implement run liveness, allocation tracking, and tab cleanup in the test harness instead of calling `AgentRunManager` and `AgentRun.finish`. Severity: 4/10

Existing Risk: 5/10 - The tests can pass even if production allocation admission or run cleanup stops waiting for and disposing the retry's replacement tab.

Proposal Risk: 2/10 - Exercising the real run manager across the refusal callback and cleanup boundary makes regressions in the ownership integration visible while leaving remote transport behavior mocked.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1672 "test remote retry ownership through the production agent run lifecycle". In `src/plugins/launch-tab-remote.test.ts`, replace the `ownRemoteLaunches` simulation for the run-owned retry cases with a production `AgentRunManager` instance and a real `AgentRun` created through it, retaining the existing remote-launch harness for channel and tab effects. Trigger a late name refusal after `run.finish('terminated')` and verify no replacement channel or tab is created. For the admitted-retry case, start `run.finish` while the retry allocation is registering, then verify cleanup remains pending until the replacement is registered and that the real manager closes that tab before `finish` resolves. Keep the existing unowned retry test as the compatibility check. The current agent manager cleanup tests cover owned-tab cleanup generally; this integration test must specifically cover the remote refusal callback entering `withRunAllocationAsync` and transferring the replacement to the production run owner.
