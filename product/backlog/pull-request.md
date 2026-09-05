# pull-request

* Deliver the plan's launch-dialog documentation update by refreshing the screenshot and its alternative text for the E2E browser control.

Existing Issue: The harness documentation describes the new E2E browser checkbox directly above an unchanged screenshot and alternative text that omit that control. Severity: 3/10

Existing Risk: 3/10 - Users see a documented field missing from the page's only visual reference and cannot tell whether the screenshot or their installed UI is current.

Proposal Risk: 1/10 - The screenshot may drift after a later dialog change, but field-enumerating alternative text makes that mismatch visible in source review.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 975: refresh the launch-dialog screenshot for the E2E browser checkbox". Retake `documentation/public/screenshots/harness-launch-dialog.png` from the branch's current `web/src/harness/HarnessLaunchDialog.tsx`, showing the E2E browser checkbox between Offline and Auto-approve in the ordering specified by `product/specs/harness.md`. Update the image alternative text in `documentation/user-documentation/advanced-agents/harness.md` to include E2E browser, check all references to that screenshot under `documentation/`, and verify the rendered documentation uses the replacement asset rather than the stale built copy under `documentation/.vitepress/dist/`.



* Keep the browser follow-up artifacts text-reviewable and remove the stale claim that ports are probed.

Existing Issue: The completed plan that replaces a raw NUL in the frame-filter test contains a raw NUL itself and is classified as binary by Git, while the browser-server test still calls the allocator's documented choose-then-bind race a port-probe race even though no probe exists. Severity: 3/10

Existing Risk: 3/10 - Reviewers cannot inspect the completed plan through an ordinary diff and future maintainers can reintroduce a probing design that the allocator and its rationale explicitly reject.

Proposal Risk: 1/10 - Both artifacts become ordinary searchable text, and a byte scan plus a terminology search will expose a recurrence.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 975: remove the binary plan byte and stale port-probe wording". Replace the literal NUL in `product/plans/complete/browser-frame-filter-test-not-binary.md` with the textual `\0` escape without changing the plan's meaning, then confirm Git renders that plan as text and a control-byte scan finds no remaining raw NUL. In `src/browser/e2e-server.test.ts`, rewrite the failure-reporting comment that says `port probe` to describe the actual race between choosing an unreserved candidate and binding it, matching `src/browser/e2e-ports.ts`, `product/plans/complete/browser-port-allocation.md`, and `ai/guidelines/sandbox-e2e-browser.md`; change no assertions or production behavior.



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
