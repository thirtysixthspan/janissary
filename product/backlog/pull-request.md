# pull-request

## ready

## development

## deferred

* Give the browser's private hop a transport boundary instead of a shared secret.

Existing Issue: Playwright's own server answers GET /json with its wsEndpointPath, unauthenticated, so the path minted for the private hop does not force clients through the protocol guard. Severity: 10/10

Existing Risk: 9/10 - A client with loopback access can scan the dynamic port range, ask the browser for its own path, and connect directly, bypassing all frame filtering and reaching an unconfined browser on hosts without Seatbelt.

Proposal Risk: 5/10 - Both remaining options are larger than a fix: one cannot be verified without a real macOS host and fails closed on every workspaced tab if the rule is malformed, and the other changes what the feature is.

Proposal: Deferred after assessment; see product/plans/deferred/browser-private-transport-boundary.md for the full analysis. Two disclosures existed and one is closed: the path is no longer passed in the child's argument vector, where ps published it to every user on a macOS host (product/plans/complete/browser-endpoint-secret-out-of-argv.md). The other cannot be closed by moving the secret anywhere, because the harness and the browser run as the same OS user and Playwright offers no way to suppress the /json handler, listen on a Unix socket, or stop listening once the guard has connected. That leaves denying the harness the browser's port in the harness Seatbelt profile, which needs the port threaded through SandboxOptions, spawnPty and the remote spawn path and whose rule syntax could not be tested here (sandbox-exec refuses to apply a profile from inside an existing sandbox), and which covers only confined hosts; or mediating browser operations through a Janissary RPC, which the feature's own plan lists as out of scope because it deletes the property the feature exists for. Choosing between them is a product decision. Until one is taken, product/specs/sandbox.md's claim that the browser's address never leaves the Janissary process overstates the position and should be reconciled with whichever is chosen.

## declined
