# Hold the first connect until the browser is listening

**Complexity: 5/10** — one new private module, one `await` added to a start sequence that already owns the child's lifetime, a reordering of the supplier's two checks so single-flight outranks "a generation exists", and a test-fixture seam. The timing is the whole risk: a wait that never gives up would hold a client open forever, and a wait that gives up too early reproduces the refused dial it exists to remove. Both bounds are one constant each, and both endings are the same `throw` the sequence already has a `catch` for.

## Summary

`startBrowser` returns as soon as `spawnBrowserChild` has forked the child, and the guard dials the address it names on that promise's resolution. The child binds its port inside `chromium.launchServer`, which has not run yet, so the first connect of every `-b` tab is a refused dial. The guard's upstream error handler closes the client with no reason at all, and the AI's `chromium.connect` rejects with nothing to go on — and because that one connect is the request, there is no retry behind it. This plan makes the start's answer mean "the browser is accepting connections", by probing the browser's own port until it is, with a bound, and by reporting a child that died during the wait as the reason the client is closed.

The two shapes the review offered are interchangeable from `ensureUpstream`'s point of view: a TCP probe inside `startBrowser`, or a readiness line the child writes to stdout once `chromium.launchServer` has resolved, waited on through a new `ChildOutputTail` capability. This plan takes the probe, and says why.

## Design decisions

1. **Probe the port, do not ask the child.** The readiness-line shape adds a parent/child contract: `runE2EBrowser` writes a line, `ChildOutputTail` grows a way to wait for one, and — because the line lands in the very tail a death report is composed from — `e2e-exit.ts` grows a way to drop it, or a user's notification line ends in `e2e browser ready` inside the report that says the browser died. That is three shared modules changed to learn something the probe learns by asking the question the guard is about to ask anyway: is this port accepting? The probe is a new private module under `src/browser/` and touches nothing shared.

2. **The wait's two endings are the sequence's existing `throw`.** `startBrowser` already catches a failure, reports it through `stopSession` — which is what appends the child's own output to the report the human reads — and rethrows so the guard closes that one client with the reason. Putting the wait inside that `try` means a dead child and a hung child are reported and closed the way every other launch failure already is, with no new reporting path and no second wording.

3. **The child may die during the wait, and that is the case worth having.** A browser that fails to launch exits *after* the spawn returned, so `generation.closed` is the only signal that the wait will not be satisfied. Re-reading it on every tick turns the guard's bare close into `e2e browser exited before it was listening` — the same account the report already carries, delivered to the client that asked.

4. **The bound is Chromium's own.** A cold launch is seconds, Playwright's default launch timeout is 30 seconds, and a child that has not bound by then has failed or is about to. Waiting 30 seconds and then ending the client is patient enough for a slow machine and finite enough that a hung launch does not hold a connection open indefinitely. A client that is held is a client that gets a close reason, which is the same ending a refusal gives it.

5. **`ensureUpstream` asks about the in-flight start first.** With the child forked before the port is bound, `lazy.generation` is set for the whole wait, so the existing "a live generation needs no start" check would hand a second client an address nothing is listening on. Inverting the two checks makes single-flight mean what it says: every client that arrives while a start is running waits for that start, whether or not its child has bound yet.

6. **A tab that closes mid-launch still kills the child.** Setting `lazy.generation` as soon as the child is forked is what makes that true, and it is the same record `close()` already stops. Without it the wait would resolve onto a closed tab, record a browser nothing can reach, and leave a confined Chromium running with its ports already given back.

## What already exists (reuse, don't rebuild)

| Need | Existing precedent | Location |
| --- | --- | --- |
| A report composed from the child's own output, delivered once | `stopSession`'s `withChildOutput`, `withoutChromiumEndLine` | `src/browser/e2e-session.ts:86` |
| A close reason for a client whose browser would not start | `launchFailure` in the guard's `bridge` | `src/browser/e2e-guard.ts:65` |
| The one loopback address the probe and the child must agree on | `E2E_LOOPBACK_HOST` | `src/browser/e2e-loopback.ts:13` |
| Frames buffered across a held handshake | `bridge`'s `pending` | `src/browser/e2e-guard.ts:100` |
| Single-flight for concurrent connects | `lazy.starting` | `src/browser/e2e-server.ts:124` |

## Proposed changes

1. **`src/browser/e2e-ready.ts` (new).** `waitForListening(session, port, boundMs?)` — a `net` connect to the browser's port on the loopback host, retried on a short interval, resolving the first time it is accepted. It rejects with `e2e browser exited before it was listening` if `session.closed` becomes true first, and with `e2e browser did not start listening in time` when the bound passes. The socket is destroyed as soon as the answer is in: the probe asks a question and hangs up, and the browser server behind it is never told a session began. The bound is a defaulted parameter so the expiry path is testable in milliseconds.

2. **`src/browser/e2e-server.ts`.** `startBrowser` awaits `waitForListening(generation, lazy.ports.browserPort)` inside its existing `try`, and records `lazy.generation` as soon as the child is forked rather than after the wait. `ensureUpstream` consults `lazy.starting` before the live-generation shortcut, so a second client arriving mid-launch waits for the launch instead of being handed an unbound address. Its doc comment gains the sentence saying a resolved start means the port is accepting.

3. **Test fixture (`src/browser/e2e-server-test-fixture.ts`).** `waitForListening` is mocked the way the fixture already mocks the guard, the scratch allocator and the ports: a stand-in that polls two fixture facts — whether the case has said the child is listening, and whether the session has closed — and rejects with the same reason the real module does. `holdBrowserPort()` and `browserIsListening()` let a case watch the connect be held. The production module is pinned directly, on real sockets, by its own suite.

4. **Docs.** `product/specs/harness.md` and `ai/guidelines/sandbox-e2e-browser.md` already promise a first connect that is held and patient; this makes that true rather than changing what they say, so neither is edited here. `product/specs/harness.md` gains the one sentence that is genuinely new — a browser that would not start within the bound ends that connect with a reason, and a later connect tries again.

## Tests

- `src/browser/e2e-ready.test.ts` (new): resolves once something is listening on the port; stays unresolved while nothing is and resolves the moment a listener appears; rejects with the exit reason when the session ends first; rejects on the bound rather than waiting forever. Real sockets on ports the OS hands out, so nothing here races another worker.
- `src/browser/e2e-server-lazy.test.ts`: `ensureUpstream` is still pending after the child has been forked and before the port is listening, then resolves with the internal address; a child that exits during the wait rejects the supplier with `e2e browser exited before it was listening` and reports the exit through `onGone` once. Every existing case in the suite keeps passing untouched — they are what proves the wait changes when the guard is answered, not what it does with a frame.
- The buffering, `file:`-refusal and close cases in `src/browser/e2e-guard.test.ts` are unchanged and must still pass.

## Out of scope

- No change to the guard, the protocol filter, the close reasons, or the buffering: once the supplier resolves, the port is accepting, which is the only thing `bridge` ever assumed.
- No change to the eager start. It has the same window, and collapsing it into the lazy one is a separate fix with its own test churn.
- No readiness line, no new `ChildOutputTail` capability, and no change to what the child writes.
- No backoff, no limit on how many restarts a tab may make, and no change to what a death reports.

## Verification

`./scripts/run.mjs check-diff`, then `node bin/janus.mjs -b <name>` and a script that calls `chromium.connect(process.env.JANISSARY_BROWSER_WS_ENDPOINT)` once: it should take as long as the launch takes and succeed, with no retry.
