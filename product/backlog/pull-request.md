<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Capture the offline flag at receipt as the spec promises.

Existing Issue: The background continuation reads the caller tab's offline flag inside the scheduled microtask rather than capturing it at launch, so a change between the receipt and the continuation changes the executor's offline value. Severity: 2/10

Existing Risk: 3/10 - A caller whose offline state changes immediately after launch would run with a different value than the one the spec says was snapshotted at publication; this becomes visible only if a tab's offline flag is mutated in the window between launch and the microtask.

Proposal Risk: 1/10 - Capturing the boolean at launch makes it immutable for the run, with no remaining path for a late change to affect it.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2064 "snapshot the offline flag at receipt". In src/subagent/launch.ts, read tab.offline into a local constant before the queueMicrotask call and pass that constant into continueLaunch instead of evaluating tab.offline inside the scheduled callback. Extend the existing mutation-snapshot case in src/subagent/launch.test.ts to mutate the tab's offline flag after launch and assert the executor still receives the value captured at receipt. Keep the other snapshots — invocation, settings, entries, channel and host — unchanged.
