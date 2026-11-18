<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

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
