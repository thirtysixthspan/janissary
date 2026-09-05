# Plan: Give the browser's private hop a transport boundary

**Complexity: 5/10** — the Seatbelt rule is small, but the private browser port must follow browser ownership through both local and remote harness spawn paths without entering the harness environment.

## Goal

Playwright's browser server answers unauthenticated discovery requests on its own loopback port. A workspaced harness that can connect to that port can discover the internal WebSocket path and bypass Janissary's protocol guard, including its `file:` URL filtering.

Make the guard the only route from a confined harness to its browser. The harness may still connect to the guard and to every other destination its workspace policy permits, but Seatbelt denies outbound connections to that browser server's specific port.

## Approach

Use static browser and non-browser variants of the online and offline profiles. The browser variants add `(deny network-outbound (remote ip (param "BROWSER_ENDPOINT")))` after the ordinary network rule and bind `BROWSER_ENDPOINT` to `localhost:<browserPort>` at spawn time. Non-browser spawns keep the original profiles and bind no browser parameter. Apple ships the same `remote ip "localhost:<port>"` filter shape, and a direct test on this host proved that a `-D` parameter is accepted inside it: the selected loopback port was denied while a neighboring loopback port remained reachable. A first attempt to use `localhost:0` as a placeholder for every spawn was rejected by Seatbelt as an invalid port, so separate static variants avoid both the invalid parameter and any denial on an unrelated valid placeholder port.

Return the private port from `startE2EBrowserServer` as Janissary-only metadata. Carry it through `harnessSpawnEnv` and the PTY sandbox options on both local and remote launches. Do not put it in the harness environment or remote protocol because each side starts its own browser and applies its own profile.

This creates a transport boundary wherever the harness workspace is actually confined by Seatbelt. On hosts without Seatbelt, with workspace isolation disabled, or for `--no-workspace` launches, the guard remains the only protection. The spec and existing user documentation must state that asymmetry plainly.

## Implementation steps

1. Extend the e2e browser and harness spawn results with the private browser port, keeping it outside the environment handed to the harness.
2. Thread that port into `SandboxOptions` through `PseudoterminalManager.spawn` for local harnesses and directly through the remote process spawn path for remote harnesses.
3. Add the parameterized deny to the static harness profile and bind its endpoint for every confined workspace spawn.
4. Run `./scripts/run.mjs check-diff` after each implementation step and fix every failure before continuing.

## Tests

- `src/browser/e2e-server.test.ts` and `src/harness/scratch-dir.test.ts`: the private port is returned as internal spawn metadata and never added to the harness environment.
- `src/harness/manager.test.ts`, `src/pseudoterminal-manager.test.ts`, and `src/remote/serve-processes.test.ts`: browser-enabled local and remote launches carry the private port into `SandboxOptions`; ordinary launches carry no port.
- `src/sandbox/index.test.ts`: only browser profile variants contain the last-match deny and bind the selected endpoint; ordinary spawns retain their original profile and bind no browser endpoint.
- `src/sandbox/browser-port.sandbox.test.ts`: on macOS, a real `sandbox-exec` profile denies the chosen private loopback port while leaving a second loopback port reachable.

## Spec and documentation

- Update `product/specs/sandbox.md` to define the private-hop boundary and limit the claim to confined workspace harnesses.
- Update `documentation/user-documentation/advanced-agents/harness.md` because its containment warning already describes this boundary and the behavior on hosts without macOS sandboxing.
- No `help.md` change: its harness entry does not describe browser containment.

## Out of scope

- Replacing Playwright's server with a Janissary browser-operation RPC.
- Claiming a transport boundary on hosts or launches where Janissary cannot apply Seatbelt.
- Changing the browser child profile, the public guard endpoint, or the protocol guard's frame policy.
