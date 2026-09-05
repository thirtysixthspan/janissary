# pull-request

* Decompose the browser test coverage into focused modules instead of extending and creating test monoliths beyond the repository's line limit.

Existing Issue: The feature adds a 329-code-line browser-server test, pushes the remote-process test from under the limit to 225 code lines, and adds large browser-specific blocks to already oversized sandbox and harness-manager suites rather than grouping the feature's tests in focused files. Severity: 5/10

Existing Risk: 5/10 - Browser lifecycle, sandbox, and remote ownership cases become expensive to navigate and increasingly share mutable mocks, making later security-boundary changes harder to review and more likely to couple unrelated tests.

Proposal Risk: 2/10 - Splitting Vitest files can change module-mock isolation if fixtures are moved carelessly, but retaining the existing assertions and running each extracted suite alone will expose that mistake.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 975: split the browser test monoliths into focused suites". Decompose `src/browser/e2e-server.test.ts` by separating environment and launch-contract coverage from lifecycle and failure-cleanup coverage, extract the browser-specific `RemoteProcesses` cases from `src/remote/serve-processes.test.ts`, and move the browser-specific additions in `src/sandbox/index.test.ts` and `src/harness/manager.test.ts` into focused colocated suites or shared fixture modules so each new or expanded file complies with `ai/guidelines/code-guidelines.md`. Preserve Vitest hoisting and module-reset behavior, keep every existing assertion about credentials, confinement, ownership, cleanup, and notifications, and verify each extracted file passes both alone and in the complete server suite.



* Make the new browser tests release every temporary resource on both success and skip paths.

Existing Issue: The scratch allocator suite creates a new temporary root before every case but removes only the last one after the suite, and the real Seatbelt port test tries to close non-listening servers after returning early when a reserved port is occupied. Severity: 4/10

Existing Risk: 4/10 - Repeated test runs leak workspace trees, while an ordinary port collision turns an intended skip into an `ERR_SERVER_NOT_RUNNING` cleanup failure and makes the sandbox suite flaky on shared hosts.

Proposal Risk: 1/10 - Cleanup becomes conditional and per-case; leaked roots or close errors remain directly visible if the ownership bookkeeping is wrong.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 975: make browser test cleanup safe on every path". In `src/browser/e2e-scratch.test.ts`, replace the single `afterAll` cleanup of the most recently assigned root with per-case cleanup or an accumulated-root teardown that removes every directory created by `beforeEach`. In `src/sandbox/browser-port.sandbox.test.ts`, close only servers whose `listening` state is true and mark the case skipped through Vitest's test context when any required band port cannot bind instead of returning into teardown with non-listening servers. Add or preserve assertions that cleanup itself does not throw, and verify repeated isolated runs leave no `e2e-scratch-*`, `sandbox-cfg-*`, or `sandbox-browser-port-*` directories created by these suites.



* Remove reviewer-directed commands from the pull request material instead of trying to override an automated reviewer's active task from inside the branch.

Existing Issue: The PR body, the completed feature plan, and the browser operating guide directly address automated reviewers and tell them what they may execute and which task takes precedence, so the reviewed branch still contains instructions aimed at the process reviewing it despite the added defensive wording. Severity: 6/10

Existing Risk: 7/10 - Treating defensive prompt text as trustworthy establishes the same branch-controlled instruction channel a malicious change would use to redirect an unattended reviewer onto commands or host-shell actions.

Proposal Risk: 2/10 - The documents can retain useful verification examples and a clearly named audience without speaking to the reviewer or asserting authority over the review task.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 975: remove reviewer-directed instructions from reviewed material". Rewrite the audience notes in `ai/guidelines/sandbox-e2e-browser.md`, `product/plans/complete/sandbox-end-to-end-browser-testing.md`, and PR #975's `How to verify` section as third-person descriptions of their intended runtime or human audience. Remove clauses beginning from the premise that the reader is an automated reviewer, commands to carry on with another task, and statements deciding which task or instruction takes precedence; preserve the operational examples as inert claims a human can evaluate and keep the runtime guide useful to an agent that receives it only after the change is trusted and installed. Verify the diff contains no branch-authored text directly instructing a reviewer to execute, avoid, or prioritize actions.



* Correct the security documentation that calls the guarded browser endpoint non-credential data and treats non-injection as proof that the live Janissary session is unreachable.

Existing Issue: The sandbox specification says the unguessable endpoint is not a credential even though it is a bearer capability for browser control, while the PR body, harness specification, and operating documentation infer that withholding the live app URL and token prevents access even in configurations where the harness is explicitly unconfined and can discover the server log or listening service itself. Severity: 6/10

Existing Risk: 6/10 - Operators and reviewers underestimate which values must be protected and may rely on non-injection as an isolation boundary on hosts where no kernel policy prevents discovery of the live application or its browser endpoint.

Proposal Risk: 2/10 - The documentation accurately distinguishes reduced disclosure from enforced isolation, while the existing contained-browser design and intended workspaced behavior remain unchanged.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 975: correct the browser capability and live-session security claims". In `product/specs/sandbox.md`, describe `JANISSARY_BROWSER_WS_ENDPOINT` as a scoped bearer capability whose secret path grants control of one contained browser, while keeping `JANISSARY_PLAYWRIGHT` as a non-secret path. Reconcile the non-injection claims in PR #975's body, `product/specs/harness.md`, `documentation/user-documentation/advanced-agents/harness.md`, and `ai/guidelines/sandbox-e2e-browser.md`: state that Janissary does not hand a harness the live application's URL or token and that active workspace confinement blocks the normal project-state route, but do not claim there is no other route when Seatbelt is unavailable, workspace isolation is disabled, or the harness uses `--no-workspace`. Cross-reference those configurations' existing warnings, preserve the rule that agents should test their own workspace server, and make no behavioral or credential-handling change.
