<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Handle a rejected runscripts execute run by posting its failure to the notifications feed, not only to the server log.

Existing Issue: The catch on the execute chain of the runscripts action sends a rejected run only to the server stderr, although subplan 04's Goal says failures go to the notifications feed, and the f9cd9dcc commit body excuses the silence by saying the subplan specifies no text for this path. Severity: 4/10

Existing Risk: 3/10 - A run whose enqueue or feed post throws shows the user nothing, so a run that never started looks like a silent success, and the only trace is a server log line.

Proposal Risk: 1/10 - The failure reaches the feed, and the residual is a feed that is itself broken, where the server log still records the cause.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1739 "post a feed line when a runscripts execute run is rejected, using the existing failed helper". In src/plugins/runscript-topic-actions.ts, the execute arm's catch callback currently calls reportCause('execute', error, action.name) and returns. Keep that reportCause call first, then post the failure through the module's existing post helper with the existing failed helper as failed('run', action.name), which yields the feed line `Could not run runscript "<name>".`, so the wording stays defined beside the other failure texts. Wrap that post in a nested try whose catch calls reportCause('execute', postError, action.name), so the outer catch cannot itself reject and reintroduce the unhandled rejection the commit removed. In src/plugins/runscript-topic-actions.test.ts, extend the existing feed-post case, whose notify mock throws once, with an assertion that the second notify call carries origin 'janus' and the text 'Could not run runscript "deploy".', and leave its stderr and unhandledRejection assertions and every other case untouched. The new feed text is wording that subplan 04 treats as needing owner confirmation, so the work report should flag it for the owner. Do not change src/commands/execute.ts or its tests, and keep src/plugins/runscript-topic-actions.ts well under the 200-code-line limit.
