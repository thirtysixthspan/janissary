# pull-request

* Correct the security documentation that calls the guarded browser endpoint non-credential data and treats non-injection as proof that the live Janissary session is unreachable.

Existing Issue: The sandbox specification says the unguessable endpoint is not a credential even though it is a bearer capability for browser control, while the PR body, harness specification, and operating documentation infer that withholding the live app URL and token prevents access even in configurations where the harness is explicitly unconfined and can discover the server log or listening service itself. Severity: 6/10

Existing Risk: 6/10 - Operators and reviewers underestimate which values must be protected and may rely on non-injection as an isolation boundary on hosts where no kernel policy prevents discovery of the live application or its browser endpoint.

Proposal Risk: 2/10 - The documentation accurately distinguishes reduced disclosure from enforced isolation, while the existing contained-browser design and intended workspaced behavior remain unchanged.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 975: correct the browser capability and live-session security claims". In `product/specs/sandbox.md`, describe `JANISSARY_BROWSER_WS_ENDPOINT` as a scoped bearer capability whose secret path grants control of one contained browser, while keeping `JANISSARY_PLAYWRIGHT` as a non-secret path. Reconcile the non-injection claims in PR #975's body, `product/specs/harness.md`, `documentation/user-documentation/advanced-agents/harness.md`, and `ai/guidelines/sandbox-e2e-browser.md`: state that Janissary does not hand a harness the live application's URL or token and that active workspace confinement blocks the normal project-state route, but do not claim there is no other route when Seatbelt is unavailable, workspace isolation is disabled, or the harness uses `--no-workspace`. Cross-reference those configurations' existing warnings, preserve the rule that agents should test their own workspace server, and make no behavioral or credential-handling change.
