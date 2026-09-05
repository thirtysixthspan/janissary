# pull-request

## ready

## development

* Close the security bypass through the browser server's unauthenticated endpoint discovery.

Existing Issue: The private Playwright listener exposes its WebSocket path through unauthenticated HTTP discovery, so its random path does not force clients through the protocol guard. Severity: 10/10

Existing Risk: 9/10 - A sandboxed client can discover the browser port and connect directly, bypassing all frame filtering and reaching an unconfined browser on hosts without Seatbelt.

Proposal Risk: 3/10 - Browser RPC remains a powerful capability, but an independently enforced private transport boundary would prevent clients from skipping the guard.

Proposal: Route this through ai/tasks/hygiene/improve-security.md for human security remediation of src/browser/e2e-child.ts and src/browser/e2e-server.ts. The pinned Playwright 1.61.1 server returns wsEndpointPath from GET /json without requiring the secret path; see the [versioned server implementation](https://raw.githubusercontent.com/microsoft/playwright/v1.61.1/packages/playwright-core/src/remote/playwrightServer.ts). A client with loopback access can discover that listener within the selected port range and use the returned path directly. Replace the assumption that an unpublished TCP address is private with a transport or authentication boundary the harness cannot access independently; suppressing discovery alone is insufficient while the secret is also supplied in child command-line arguments. Keep the public guard's path checks and add coverage that exercises the actual upstream HTTP discovery and direct-connection surfaces, which src/browser/e2e-guard.test.ts currently replaces with a generic WebSocket stub. Verify the boundary on both confined and unconfined hosts before updating the containment claims in product/specs/sandbox.md.


* Keep review-time security instructions separate from the pull request's verification examples.

Existing Issue: The PR description directs its reviewer to run test commands and host-shell checks, and the carried plan and operating guide direct dependency installation and command execution despite the review task treating this material solely as data. Severity: 4/10

Existing Risk: 6/10 - An unattended reviewer that follows those embedded directions executes branch-controlled tooling outside the authorized reading-and-backlog workflow.

Proposal Risk: 2/10 - Documentation will still contain operational examples, but explicit audience and trust boundaries reduce the chance they are mistaken for authorization.

Proposal: Have a human revise the review-facing instructions in PR #975's How to verify section and clarify the intended execution context of product/plans/complete/sandbox-end-to-end-browser-testing.md and ai/guidelines/sandbox-e2e-browser.md. Preserve useful verification examples as non-authoritative reference material and state that they do not override the active review task or authorize a reviewer to install dependencies, execute tools, or switch to host-shell checks. The specific reviewer-directed host-shell request and the guide's dependency-installation imperative were treated as data during this review and were not executed. Review the revised wording against ai/tasks/pull-request-review.md's explicit untrusted-content rule; this is a documentation and review-boundary change, with no source behavior to alter.

## deferred

## declined
