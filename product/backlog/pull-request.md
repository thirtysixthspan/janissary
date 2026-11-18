<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Handle termination during pending remote clone creation so a late successful clone cannot hang the completion.

Existing Issue: When a remote run is terminated after its clone request is submitted but before the clone resolves, and that clone later succeeds, the handle neither resolves nor rejects readiness, so the launch continuation waits forever and never publishes a completion. Severity: 8/10

Existing Risk: 7/10 - Terminating a remote subagent while its clone is provisioning can silently swallow the completion and leave the background continuation pending indefinitely, with no terminal message for the caller.

Proposal Risk: 2/10 - Readiness is always settled once termination is recorded, so the continuation reaches settlement and the recorded terminated outcome overrides the result; the existing latches guard against a second settlement.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2064 "settle remote readiness when termination arrives during pending clone creation". In src/subagent/remote-workspace.ts, release()/doRelease() sets cancelled but never calls rejectReady; when the run ends while a create is pending and the create later returns a directory, startup()'s ended(run) guard returns without settling readiness, so src/subagent/launch.ts's await remote.ready never returns and settleSubagentRun never runs. Make the final release also reject an unsettled readiness with git clone cancelled., using the existing rejectReady latch so the late success cannot resolve readiness or reach lookup, while keeping the ended(run) guard after the awaited create. Add a src/subagent/remote-workspace.test.ts case that starts a pending create, finishes the run as terminated, answers create with a successful directory, and asserts readiness rejects with git clone cancelled. and no lookup begins; add a matching launch/settlement case proving exactly one terminal completion is delivered. Keep cancel()'s existing late-success and one-shot release behavior and the invariant that allocation ends before readiness; a stale stub whose allocation already ended cannot prove this regression.

* Deliver the plan's real-driver executor-rejection tests for the owned-abort cleanup path.

Existing Issue: The subplan's focused local and selected-remote cases that admit the real replacement driver and throw from its fallback activity subscriber are absent; every executor-rejection test uses a plain rejected-promise stub, including the case whose allocation was already ended. Severity: 5/10

Existing Risk: 5/10 - The subtle owned-run abort that unblocks a stuck allocation on executor rejection is never exercised against the real driver lifecycle, so a regression that reintroduces the settlement hang would pass the suite.

Proposal Risk: 2/10 - The integration cases pin the abort-before-settlement order and no-hang behavior with the real driver, while the existing unit tests remain as fast coverage of the outcome variants.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2064 "add real-driver executor-rejection integration tests". In src/subagent/launch.test.ts and src/subagent/settle.test.ts, add the two focused cases named in the subplan Tests section: use the real executeSubagentRun and its real attempt driver (do not mock ./execute.js for these cases), admit the replacement driver, and throw an exact multiline error from the fallback activity subscriber while the attempt is still active and its disposal is deferred. Assert the owned signal aborts before failed settlement, disposal happens once, completion stays pending until disposal and allocation release, settlement then completes without a hang with one failed completion carrying the original error and first observed provider identity, and late terminal callbacks cannot replace the failure or send another reply. Add the selected-remote variant using the real channel fixture and assert the ready clone is retained and the channel lease dropped last; assert a normal returned failed result introduces no abort. Keep these cases focused — one local and one remote, not a repeated executor tool/fallback/permission matrix — and do not use a stub whose allocation has already ended as the sole proof.

* Capture the offline flag at receipt as the spec promises.

Existing Issue: The background continuation reads the caller tab's offline flag inside the scheduled microtask rather than capturing it at launch, so a change between the receipt and the continuation changes the executor's offline value. Severity: 2/10

Existing Risk: 3/10 - A caller whose offline state changes immediately after launch would run with a different value than the one the spec says was snapshotted at publication; this becomes visible only if a tab's offline flag is mutated in the window between launch and the microtask.

Proposal Risk: 1/10 - Capturing the boolean at launch makes it immutable for the run, with no remaining path for a late change to affect it.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2064 "snapshot the offline flag at receipt". In src/subagent/launch.ts, read tab.offline into a local constant before the queueMicrotask call and pass that constant into continueLaunch instead of evaluating tab.offline inside the scheduled callback. Extend the existing mutation-snapshot case in src/subagent/launch.test.ts to mutate the tab's offline flag after launch and assert the executor still receives the value captured at receipt. Keep the other snapshots — invocation, settings, entries, channel and host — unchanged.
