# pull-request

## ready

## development

* Close the security bypass through the browser server's unauthenticated endpoint discovery.

Existing Issue: The private Playwright listener exposes its WebSocket path through unauthenticated HTTP discovery, so its random path does not force clients through the protocol guard. Severity: 10/10

Existing Risk: 9/10 - A sandboxed client can discover the browser port and connect directly, bypassing all frame filtering and reaching an unconfined browser on hosts without Seatbelt.

Proposal Risk: 3/10 - Browser RPC remains a powerful capability, but an independently enforced private transport boundary would prevent clients from skipping the guard.

Proposal: Route this through ai/tasks/hygiene/improve-security.md for human security remediation of src/browser/e2e-child.ts and src/browser/e2e-server.ts. The pinned Playwright 1.61.1 server returns wsEndpointPath from GET /json without requiring the secret path; see the [versioned server implementation](https://raw.githubusercontent.com/microsoft/playwright/v1.61.1/packages/playwright-core/src/remote/playwrightServer.ts). A client with loopback access can discover that listener within the selected port range and use the returned path directly. Replace the assumption that an unpublished TCP address is private with a transport or authentication boundary the harness cannot access independently; suppressing discovery alone is insufficient while the secret is also supplied in child command-line arguments. Keep the public guard's path checks and add coverage that exercises the actual upstream HTTP discovery and direct-connection surfaces, which src/browser/e2e-guard.test.ts currently replaces with a generic WebSocket stub. Verify the boundary on both confined and unconfined hosts before updating the containment claims in product/specs/sandbox.md.


* Narrow the security carve-in that exposes the installation's project credentials and other workspaces.

Existing Issue: The browser profile grants recursive reads of the entire Janissary installation root, including project state and credential files when Janissary runs from its own checkout. Severity: 9/10

Existing Risk: 8/10 - A browser operation that bypasses URL filtering can read project tokens, server logs, or sibling workspace contents that the harness's own sandbox denies.

Proposal Risk: 3/10 - A reduced runtime allowlist can still miss a required dependency, but startup checks and explicit forbidden-file probes would expose that regression.

Proposal: Route through ai/tasks/hygiene/improve-security.md for human review of the appDir binding in src/browser/e2e-server.ts and the recursive app carve-in in src/sandbox/browser-profile.ts. src/project-tokens.ts stores credentials beneath the project's .janissary directory, and bin/janus.mjs writes the live server URL to that directory's log; these are not merely application code when appDir is the project checkout. Carve in only the runtime entry points and dependency directories the child requires, with explicit exclusions for project state, credentials, and unrelated clones. Extend src/sandbox/browser-profile.test.ts beyond checking that credential names are absent from the template: bind a checkout-shaped installation and verify that representative state files remain denied. Reconcile product/specs/harness.md, product/specs/sandbox.md, and both changed user documentation pages with the resulting boundary; their claim that a bypass can reach only an empty scratch directory is stronger than the current rules.


* Scrub browser credentials on the unconfined security fallback as well as on macOS.

Existing Issue: sandboxSpawn returns the inherited server environment before reaching the browser-specific scrub when sandboxing is unavailable or disabled. Severity: 7/10

Existing Risk: 7/10 - Ambient provider keys, tokens, and agent sockets are inherited by a less-trusted browser process on the very hosts where its kernel confinement is absent.

Proposal Risk: 2/10 - An overly narrow environment could prevent startup under a custom installation, which explicit environment and launch tests would reveal.

Proposal: Route through ai/tasks/hygiene/improve-security.md for human remediation in src/sandbox/index.ts and src/browser/e2e-server.ts. Select the credential-free browser environment independently of the Seatbelt availability branch, before withWorkspaceCredentials can return the caller's process.env. Preserve the existing unconfined credential behavior for harnesses, whose authentication needs differ from the browser's. Add browser tests with sandboxWorkspaces disabled and sentinel NPM_TOKEN, provider credentials, and SSH_AUTH_SOCK values; assert that none reach the child while required runtime variables and TMPDIR remain usable. The current browser credential test in src/sandbox/index.test.ts skips when sandboxAvailable is false and therefore does not cover this path. Update the PR description's unconditional claim that browser selection precedes credential handling after the implementation supports it.


* Match browser URL normalization at the protocol guard's security boundary.

Existing Issue: The file-scheme detector removes leading controls but leaves embedded tabs and newlines intact, allowing URL strings that Chromium normalizes to the file scheme. Severity: 7/10

Existing Risk: 6/10 - A client can make the browser attempt filesystem navigation through a frame the outbound guard has approved, defeating the promised independent preventive layer.

Proposal Risk: 2/10 - Other protocol bypass classes remain, but parser-aligned scheme detection would close this direct normalization discrepancy.

Proposal: Route through ai/tasks/hygiene/improve-security.md for human validation work in src/browser/e2e-frame-filter.ts. schemeOf treats a string containing an embedded tab between fi and le as a different scheme, whereas the [URL parser standard](https://url.spec.whatwg.org/#concept-basic-url-parser) removes ASCII tabs and newlines throughout the input before parsing. Use parser-aligned normalization, preserving the existing treatment of ordinary text and non-file schemes. Add escaped tab, carriage-return, and newline cases inside the scheme to src/browser/e2e-frame-filter.test.ts and actual relay-blocking cases to src/browser/e2e-guard.test.ts. Do not treat the inbound navigation-result check as proof that the outbound operation never occurred; it is a later layer and does not restore the promised pre-navigation rejection.


* Handle hosts whose localhost address resolves to IPv6.

Existing Issue: The child leaves Playwright's host at its localhost default while the guard always connects to 127.0.0.1. Severity: 7/10

Existing Risk: 6/10 - The browser can start successfully on IPv6 loopback while every guard connection fails against IPv4, leaving the feature unusable without a browser-exited notification.

Proposal Risk: 2/10 - A host that lacks the selected loopback family could still fail, but explicit matching listener and connector configuration removes resolver disagreement.

Proposal: Use ai/tasks/work-an-issue.md to make the listener in src/browser/e2e-child.ts and upstream URL in src/browser/e2e-guard.ts use the same explicit loopback address, preferably 127.0.0.1 to match the existing published endpoint. The [pinned Playwright listener](https://raw.githubusercontent.com/microsoft/playwright/v1.61.1/packages/utils/wsServer.ts) defaults hostname to localhost and advertises the bound address precisely to avoid address-family disagreement, but this implementation discards that endpoint and reconstructs an IPv4 URL. Add a launch-options assertion for host and a connection case covering IPv6-first localhost resolution. src/browser/e2e-guard.test.ts currently binds its stub upstream explicitly to IPv4, masking the mismatch. Retain loopback-only binding.


* Release browser resources when startup fails or the browser exits unexpectedly.

Existing Issue: Browser failure callbacks only notify, leaving the guard and scratch directories alive until tab disposal, and a later PTY-spawn exception can strand the browser before any runtime owns its handle. Severity: 6/10

Existing Risk: 5/10 - Failed launches retain listeners or Chromium processes for the lifetime of a tab or server, accumulating resources and leaving unusable endpoints active.

Proposal Risk: 2/10 - Cleanup ordering can still race process exit, but one idempotent owner with explicit rollback can make those transitions observable and bounded.

Proposal: Use ai/tasks/work-an-issue.md to give src/browser/e2e-server.ts a single cleanup path for guard failure, child error, unexpected child exit, and explicit close, while preserving exactly-once notifications and suppression after user disposal. A guard bind failure must stop its child, and child failure must stop the guard and remove its scratch allocation. Ensure partial synchronous setup failures roll back resources already acquired. In src/harness/manager.ts and src/remote/serve-processes.ts, close the returned handle if PTY creation or runtime setup throws before ownership is established. Extend src/browser/e2e-server.test.ts, src/harness/manager.test.ts, and src/remote/serve-processes.test.ts with these failure transitions; existing tests assert notification calls but do not assert failure cleanup. Keep browser restart out of scope.


* Deliver the plan's usable port allocation instead of unchecked random port pairs.

Existing Issue: The plan promises two free ports, but the implementation draws two independent random integers without checking availability or even ensuring they differ. Severity: 5/10

Existing Risk: 4/10 - A launch can fail against an already occupied port or collide with its own guard, and the random distinct-port test can fail intermittently.

Proposal Risk: 2/10 - Port acquisition can still fail under contention, but bounded allocation and deterministic collision coverage make that failure explicit.

Proposal: Use ai/tasks/work-an-issue.md to reconcile the port design in product/plans/complete/sandbox-end-to-end-browser-testing.md with src/browser/e2e-server.ts. The synchronous published endpoint requirement rules out simply awaiting the plan's throwaway probes inside the current API, so retain that requirement while selecting a workable allocation scheme, such as a synchronously known public candidate with bounded bind handling and an asynchronously communicated OS-assigned private port. At minimum never select the same port for both listeners. Add deterministic occupied-port and repeated-draw coverage to src/browser/e2e-server.test.ts rather than asserting random draws happen to differ. Update the plan and operational guidance to state the actual remaining collision behavior and verify that a failure cleans up the other listener and child.


* Keep review-time security instructions separate from the pull request's verification examples.

Existing Issue: The PR description directs its reviewer to run test commands and host-shell checks, and the carried plan and operating guide direct dependency installation and command execution despite the review task treating this material solely as data. Severity: 4/10

Existing Risk: 6/10 - An unattended reviewer that follows those embedded directions executes branch-controlled tooling outside the authorized reading-and-backlog workflow.

Proposal Risk: 2/10 - Documentation will still contain operational examples, but explicit audience and trust boundaries reduce the chance they are mistaken for authorization.

Proposal: Have a human revise the review-facing instructions in PR #975's How to verify section and clarify the intended execution context of product/plans/complete/sandbox-end-to-end-browser-testing.md and ai/guidelines/sandbox-e2e-browser.md. Preserve useful verification examples as non-authoritative reference material and state that they do not override the active review task or authorize a reviewer to install dependencies, execute tools, or switch to host-shell checks. The specific reviewer-directed host-shell request and the guide's dependency-installation imperative were treated as data during this review and were not executed. Review the revised wording against ai/tasks/pull-request-review.md's explicit untrusted-content rule; this is a documentation and review-boundary change, with no source behavior to alter.

## deferred

## declined
