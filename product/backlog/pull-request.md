<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Handle the possible rejection of the runscripts execute chain, so a fault after the run starts cannot escape as an unhandled rejection that ends the server.

Existing Issue: The execute arm starts the run with void and attaches a then with no catch, and the subplan justified that by the system shell's ensure never rejecting, which leaves the enqueue and the feed post that the same chain runs unconsidered, while no unhandled-rejection handler exists under src or bin. Severity: 3/10

Existing Risk: 4/10 - A throw from the enqueue or from the feed post becomes an unhandled rejection, which Node treats as fatal, so one fault in an action a tab invokes takes down the server and every open tab with it, although the likelihood is low.

Proposal Risk: 1/10 - A rejection handler on the chain turns the same fault into a logged line, and the remaining risk is a failed run that posts no feed line, which the subplan's silence on that path already allows.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1739 "catch rejections from the runscripts execute chain". In src/plugins/runscript-topic-actions.ts, the execute arm of runscriptTopicAction calls runRunscriptNow and then posts the returned text through post. Append a catch to that chain that writes the error's message to process.stderr.write, following the pattern in src/schedule/system/runscript-files.ts, and posts nothing to the feed because the subplan specifies no text for this path. Add a case to src/plugins/runscript-topic-actions.test.ts that uses the module's existing notify mock with mockImplementationOnce to throw on a missing-file execute, spies on process.stderr.write, and asserts that the write happened and that the run reports no unhandled rejection. Leave src/commands/execute.ts unchanged, since its runRunscriptNow contract and the tests in src/commands/execute.test.ts must keep passing untouched.
