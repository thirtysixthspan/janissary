# Plan: Allocate the e2e browser's two ports instead of drawing them blind

**Complexity: 4/10** — one new module owning the port pair, three call sites, and a correction to two documents that describe a scheme the code never implemented. No change to when the endpoint is known or to how a lost port is reported.

## Goal

`startE2EBrowserServer` calls `pickPort()` twice, and `pickPort` is a bare `randomInt(49_152, 65_536)`. Two things follow that the plan of record says do not happen.

The plan says the launch "picks two free ports by binding throwaway `node:net` servers to port 0 on `127.0.0.1` and closing them". Nothing binds anything. Availability is never checked, against the host or against Janissary itself: two `-b` tabs opened at once can be handed the same port, and one of them will fail to bind for a reason entirely within this process's control.

Worse, the two draws are independent, so a single launch can hand the guard and the browser the *same* port. The guard would then bind it, the child would fail to bind it, and the guard would be proxying to itself. The suite's own assertion for this — `expect(call.port).not.toBe(call.upstreamPort)` — is a coin flip that comes up heads 16383 times in 16384, which is exactly the shape of a test that fails once in CI and is never reproduced.

The published endpoint still has to be known synchronously, which is what rules out the plan's probes: Node cannot bind a TCP port synchronously — `listen()` defers the bind behind a host lookup, and `address()` is `null` until it completes — so a probe means an `await`, and the whole design turns on the PTY spawn never waiting on the browser.

So: allocate what can be allocated synchronously, and be accurate about the rest.

## Approach

Add `src/browser/e2e-ports.ts`, which owns the pair rather than producing two numbers.

**A reservation the process honours.** A module-level set holds every port handed out and not yet given back. A draw that lands on a reserved port walks forward to the next free one rather than being redrawn, which makes the allocation terminate and stay bounded under any draw at all, including a degenerate one. Two consequences, both deterministic rather than probable: a single launch's two ports are never equal, and two concurrent launches never share a port. Those are precisely the collisions Janissary causes and can therefore prevent.

**The draws stay independent.** The browser's own port is not derived from the guard's. A client holding the published endpoint knows the guard's port, and the design's claim is that holding it reveals no route around the guard; making the second port `guardPort + 1` would weaken that for no gain.

**A port lost to another process stays a race, handled rather than hidden.** Nothing synchronous can reserve a port against the rest of the host. That window — between the number being chosen and the listener binding it — is the same one the plan already acknowledged, and it is not silent: the guard or the child fails to listen, the session is torn down in full, and the user is notified. That teardown is what makes a lost race bounded, and it is asserted rather than assumed.

**Ports are given back.** `allocateBrowserPorts` returns a `release()` alongside the pair, and the session teardown calls it with everything else it releases, so a long-lived server does not accumulate reservations for browsers that ended hours ago.

**The documents are corrected.** The implementation plan of record describes throwaway `node:net` probes in its §1 and its fifth design decision; both are rewritten to describe what the code does and what remains a race. The operating guide gains one line under "When it stops working" for a browser that never came up because its port was taken.

## Implementation steps

1. Add `src/browser/e2e-ports.ts` with the dynamic-range constants, the reservation set, `allocateBrowserPorts()` returning `{ guardPort, browserPort, release }`, and the comment explaining why nothing is probed.
2. `src/browser/e2e-server.ts` — drop `pickPort`, allocate the pair once, and use `guardPort`/`browserPort` from it.
3. `src/browser/e2e-session.ts` — add a `ports` slot and release it in the teardown alongside the guard, the child, and the scratch allocation.
4. Correct §1 and decision 5 of `product/plans/complete/sandbox-end-to-end-browser-testing.md`, and add the operational line to `ai/guidelines/sandbox-e2e-browser.md`.
5. Run `./scripts/run.mjs check-diff`.

## Tests

- `src/browser/e2e-ports.test.ts` (new, with `node:crypto`'s `randomInt` stubbed so every case is deterministic and none depends on a draw happening to differ):
  - one allocation's two ports differ even when every draw returns the same number — the case the current suite leaves to chance;
  - a second allocation reuses neither port of a live one, again under a constant draw, which is the deterministic form of the occupied-port case;
  - four concurrent allocations produce eight distinct ports;
  - `release()` returns both, so the next allocation under the same constant draw takes them again;
  - releasing one allocation does not free another's ports;
  - every port allocated lies inside the dynamic/private range.
- `src/browser/e2e-server.test.ts`:
  - the guard's own port and the browser's port always differ, asserted through the allocator rather than as a probability;
  - two live browsers use four distinct ports, and closing one frees only its own;
  - a guard that cannot listen releases the child, the scratch allocation, *and* the ports — the lost-race path end to end.

## Spec and documentation

`product/specs/harness.md` and `product/specs/sandbox.md` describe what `-b` starts and what contains it; neither names a port or a port range, and neither becomes wrong. What is wrong is the implementation plan of record and, by omission, the operating guide — both corrected as described above. No `help.md` or user-documentation change.

## Out of scope

- Making the published endpoint's port asynchronously allocated. It would remove the last of the race, and it costs the property the whole feature is built on: that the PTY spawn never waits on the browser.
- Having the child report an OS-assigned private port back to the guard. That moves the guard's upstream address to something learned after it is already accepting clients, which is a change inside the security boundary and warrants its own review rather than riding along here.
- Retrying a launch that lost its port. Nothing restarts a browser in this feature, by design.
- The remaining findings in `product/backlog/pull-request.md`, which are routed to human security remediation.
