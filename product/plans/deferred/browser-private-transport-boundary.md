# Plan: Give the browser's private hop a real transport boundary

**Complexity: 8/10 — deferred, and deliberately not implemented.** Every option below either changes the shape of the feature or depends on behaviour that cannot be verified without running a real confined browser on a real macOS host. This file records the assessment so the next person starts from it rather than from the finding.

## The finding

The browser server listens on loopback under a path minted by `makeToken()`. The design treats that path as the credential for the private hop: hold it and the port, and you reach the browser directly, with no frame ever passing the protocol guard. On a host without Seatbelt that is an unconfined browser.

The path is not a secret. Two independent disclosures:

1. **Playwright serves it.** The pinned Playwright 1.61.1 server answers `GET /json` on the same port with `{"wsEndpointPath": "<the path>"}`, with no authentication of any kind (`playwrightServer.ts`, visible in `node_modules/playwright-core/lib/coreBundle.js`). Anything that can reach the port can ask for the path. The port is one of 16,384 in the dynamic range and is trivially scanned.
2. **Janissary published it in the process listing.** The path was passed as `--ws-path <token>` on the child's command line, which `ps` shows to *any* user on a macOS host. This one is fixed — see `product/plans/complete/browser-endpoint-secret-out-of-argv.md` — which narrows the disclosure to the same user but does not touch disclosure 1.

So after that fix the position is: any process that can open a TCP connection to loopback can still discover the path and bypass the guard.

## Why this is not a small fix

**No secret passed to a child survives a same-user adversary.** The harness and the browser run as the same OS user. Whatever channel carries the path — argument vector, environment, a file, standard input — a same-user process can read it through process or filesystem inspection. Moving the secret around changes who has to work slightly harder; it does not create a boundary.

**Playwright cannot be told to stop serving it.** `chromium.launchServer()` takes `port`, `host`, and `wsPath` and nothing else relevant. The `/json` handler is internal to `PlaywrightServer`, the underlying HTTP server is not exposed on the returned `BrowserServer`, and there is no listen-on-a-file-descriptor or Unix-socket option. Any browser server Playwright starts opens a discoverable TCP listener on loopback, and closing the listener after the guard connects is not offered either.

**So the boundary has to come from outside the process.** Two candidates, both real, both bigger than a fix.

### Option A — deny the harness the browser's port at the sandbox

Add a `(deny network-outbound (remote ip "localhost:<browserPort>"))` rule to the harness profile. If the harness cannot open that port, the guard is the only route, which is exactly the property the design claims.

What it costs: the browser's port has to be threaded from `startE2EBrowserServer` through `SandboxOptions`, `spawnPty`, `PseudoterminalManager.spawn`, and the remote spawn path, with a placeholder for every spawn that has no browser — the same threading the feature's plan declined for the Playwright read carve-in, for a much weaker reason than this one.

What is unverified: whether Seatbelt accepts a `-D` parameter inside a `remote ip` filter, or whether the port must be interpolated into the profile text — which the profile modules deliberately never do, since a static string with parameters is what keeps them free of an injection surface. **This could not be tested during the assessment**: `sandbox-exec` refuses to apply a profile from inside an existing sandbox (`sandbox_apply: Operation not permitted`), which is the same nested-sandbox limitation the feature's own design decision 10 records. A malformed rule here does not fail safe — `sandbox_apply` fails and *every* workspaced harness tab stops launching. It needs a real macOS host and a deliberate test.

What it does not cover: hosts without Seatbelt, which is where the risk is highest. The feature already documents that asymmetry for the browser's own confinement, so it would be consistent — but it would leave the finding's stated risk, "reaching an unconfined browser on hosts without Seatbelt", untouched.

### Option B — never expose a Playwright server to the agent

Mediate browser operations through a Janissary RPC of its own, so no Playwright endpoint exists for the agent to reach around. The feature's plan already names this and lists it as out of scope: "It is the only design with no bypass class at all, and it deletes the property this feature exists for, which is the AI writing its own Playwright script."

That trade is the actual decision to be made here, and it is a product decision rather than a security fix.

## What should happen next

Someone with a macOS host should establish whether Option A's rule can be expressed with a parameter, and measure what it costs to thread the port. If it can, it closes the confined case and the specs should then say plainly that the private hop is a boundary *only* where Seatbelt applies, and remains a shared secret elsewhere.

Until then, `product/specs/sandbox.md`'s claim that "the browser's own address behind it never leaves the Janissary process" overstates the position: the address does not leave the process, but it is served on request by the browser to anything that reaches it. That sentence should be reconciled with whichever option is taken, and is deliberately left alone here rather than softened in isolation.

## Out of scope for this plan

- The two changes already made against this finding: keeping the path out of the argument vector, and the environment allowlist that stops the browser inheriting the server's credentials.
- Anything that only moves the secret to a different channel, for the reason given above.
