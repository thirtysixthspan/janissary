<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Remove the completed deferred-allocation plan's executable verification directive.

Existing Issue: `product/plans/complete/revalidate-deferred-plugin-allocations.md` still directs readers to execute `check-diff` after each implementation step, despite recording completed work. Severity: 5/10

Existing Risk: 5/10 - A future agent following this completed plan may run project-controlled tooling outside its assigned task, which can execute repository scripts and blur the boundary between reviewed content and authorized actions.

Proposal Risk: 2/10 - Replacing the imperative command with a factual statement of the plan's recorded test coverage removes the execution prompt while leaving the implementation history clear.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1672 "remove the completed deferred-allocation plan verification directive". In `product/plans/complete/revalidate-deferred-plugin-allocations.md`, replace the `check-diff` instruction in the Tests section with a descriptive summary of the late-callback refusal and admitted-allocation cleanup coverage already named there. Re-read the full plan and `product/plans/complete/remove-operational-directives-from-reviewed-plans.md` to ensure the completed plan contains no command that directs readers to run tooling and the cleanup record no longer implies this plan's command was removed. No application tests are needed for this wording-only change; verify it by reading the complete plan and focused diff.


* Keep remote launch retries within the allocating agent run's ownership boundary.

Existing Issue: A default-name remote plugin launch retries by calling `launchRemotePluginTab` directly from its asynchronous refusal callback, bypassing run allocation admission and tab registration. Severity: 7/10

Existing Risk: 6/10 - If the run ends while the first remote launch is pending, its retry can create a replacement tab after cleanup has already captured and closed the run's owned tabs, leaving a plugin tab and remote resources alive without an owner.

Proposal Risk: 2/10 - Retrying only while the originating run is live and admitting the replacement through that run's allocation boundary ensures cleanup either owns the replacement or refuses the retry.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1672 "keep remote launch retries within agent run ownership". In `src/plugins/launch-tab-remote.ts`, preserve the originating run identity and allocation-registration callback in `RemoteNameRetry.relaunch`; in `src/launch-name/fail-remote.ts`, gate retries on that run still being live and route each retry through run allocation admission rather than invoking `launchRemotePluginTab` untracked. Ensure a retry refused after termination does not open a new tab or leave its remote process running. Extend `src/plugins/launch-tab.test.ts` with a default-name remote launch whose first refusal arrives after run termination, and assert no replacement tab is created; also cover a retry admitted before termination and assert run cleanup waits for and closes its replacement. Keep the existing remote name-retry tests passing, since unowned launches must retain their current retry behavior.
