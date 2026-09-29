# Pull request testing

### Running the testing steps

A test run takes an open pull request, builds and starts the app from its head branch in isolated scratch state, and drives it through the E2E browser attached to the harness tab. It requires that browser and stops before checking anything out without it. The steps it runs are the ones the pull request offers as proof that it works: the "How to verify" section of its description, and the manual checks in the Verification section of any plan it carries. A step found in both is run once. Every failing step is run a second time on a freshly started app; one that fails only once is reported as intermittent with its observed rate.

The branch's dependencies are installed only after a supply-chain audit of its lockfile passes, using the installation's own audit rather than the branch's copy, and no install script runs. The build and the server still run the branch's code inside the tab's sandbox.

### Edge cases

After the pull request's own steps, the run writes and runs further steps for edge cases in the behavior the pull request changes: empty states, error paths, cancelling, repeating an action, unexpected input, and interaction with neighbouring features. There is no cap on their number, and nothing the plan defers as out of scope is tested. A generated step whose expected result no plan, spec, or description states fails only on plainly broken behavior, such as an uncaught error, a hang, a crash, or lost data; anything else it shows is reported as unspecified and not recorded.

When a pull request carries no testing steps at all, the run writes steps from its plan and diff, runs them, and records that the description lacks testing steps.

### Steps that are not run

Testing steps are pull request content and are treated as untrusted. A step is run only when it exercises the app started for the run, through its UI, its own CLI, or a shell command confined to the run's scratch state. Three kinds of step are reported as not tested, with no finding recorded: an unsafe step, which would install something, reach a non-loopback host, touch files outside the project and scratch state, read a credential, push, or edit a tracked file; a tooling step, which runs the project's lint, typecheck, test suite, or checks; and an environment step, which needs a credential, a remote host, an external network, or a native window. When the branch will not build or start, every step is reported as not tested and nothing is recorded.

### Recording failures

Failures are recorded in the [[pull-request-review]] backlog on the pull request's own branch, in the same entry shape and routed to the same follow-up work. Each entry carries the step's source and verbatim text, the exact inputs, expected and observed results, the researched root cause or what was ruled out, the likely fix, and what a regression test should assert, so the failure can be replicated without the run that found it. Failures sharing a root cause become one entry. A step that is itself wrong, because the app behaves as its plan or spec says, is recorded as a correction to the pull request description, including when the wrong step came from the plan. A failure an existing entry already covers adds a dated re-observation to that entry instead of a new one. A run with nothing to record commits nothing.

### What a run never does

A run never fixes what it finds, never edits the pull request's title or description, never posts to the pull request, never runs the project's quality tooling, and never merges or closes the pull request. Steps that pass appear only in the run's report, which lists every step with its source and result, and every step not tested with its reason.
