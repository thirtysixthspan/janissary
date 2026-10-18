<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Handle the runscripts action failures so each one keeps its cause in the server log, not only the generic feed line.

Existing Issue: Each failure catch in the new action module drops the thrown error, so a permission, write, or directory fault reaches the feed as the generic line and leaves its cause in no log on the server. Severity: 3/10

Existing Risk: 3/10 - A permission or disk fault in a project's scripts folder can only be diagnosed by reproducing it, because the feed line names the action and the file but not the reason the action failed.

Proposal Risk: 1/10 - The feed text stays exactly as the subplan specifies, and the remaining risk is a noisy stderr line for an expected symlink refusal, which the existing scripts code already tolerates.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1739 "keep the cause of each runscripts action failure in the server's stderr". In src/plugins/runscript-topic-actions.ts, the catch blocks in deleteOne, cloneOne, openOne, createOne, and ensureDirectory currently bind no error. Change each to bind the caught error and write its message to process.stderr.write, in the form src/schedule/system/runscript-files.ts already uses in excludeScriptsFromGit, prefixed with the action name and the runscript name. Leave every post(...) call and its text unchanged so the feed lines still match the subplan verbatim. The existing tests in src/plugins/runscript-topic-actions.test.ts that drive the symlink and directory-setup failures already reach these catch blocks; extend those cases to spy on process.stderr.write and assert that the cause was written, and leave every existing feed assertion untouched. src/plugins/topics.test.ts and src/plugins/host.test.ts do not reach these paths and need no change.


* Handle the possible rejection of the runscripts execute chain, so a fault after the run starts cannot escape as an unhandled rejection that ends the server.

Existing Issue: The execute arm starts the run with void and attaches a then with no catch, and the subplan justified that by the system shell's ensure never rejecting, which leaves the enqueue and the feed post that the same chain runs unconsidered, while no unhandled-rejection handler exists under src or bin. Severity: 3/10

Existing Risk: 4/10 - A throw from the enqueue or from the feed post becomes an unhandled rejection, which Node treats as fatal, so one fault in an action a tab invokes takes down the server and every open tab with it, although the likelihood is low.

Proposal Risk: 1/10 - A rejection handler on the chain turns the same fault into a logged line, and the remaining risk is a failed run that posts no feed line, which the subplan's silence on that path already allows.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1739 "catch rejections from the runscripts execute chain". In src/plugins/runscript-topic-actions.ts, the execute arm of runscriptTopicAction calls runRunscriptNow and then posts the returned text through post. Append a catch to that chain that writes the error's message to process.stderr.write, following the pattern in src/schedule/system/runscript-files.ts, and posts nothing to the feed because the subplan specifies no text for this path. Add a case to src/plugins/runscript-topic-actions.test.ts that uses the module's existing notify mock with mockImplementationOnce to throw on a missing-file execute, spies on process.stderr.write, and asserts that the write happened and that the run reports no unhandled rejection. Leave src/commands/execute.ts unchanged, since its runRunscriptNow contract and the tests in src/commands/execute.test.ts must keep passing untouched.
