# Release a lazy tab's live browser when the guard reports it cannot listen

**Complexity: 3/10** — the teardown the handle already performs is extracted into one closure and handed to the guard as its `onError`; nothing about the guard, the ports, the scratch rule or the reporting shape changes. The only new behavior is that a guard failure now also ends a browser that was working, which is two test cases rather than new code.

## Summary

`startLazyE2EBrowserServer` splits what the eager start kept in one session across two: the tab's session holds the guard and the ports, and each browser behind the guard is a generation of its own. The guard's `onError` was written for the eager shape and stops only the tab session, so a guard that fails after a browser is up — a bind race on the published port, an accept failure — leaves a confined Chromium running with nothing that can reach it, its scratch directory in place, and its port handed back to the band so a later launch can be refused for it. This plan routes the guard's failure through the same release a closing tab runs.

## Design decisions

1. **One teardown, two callers.** The body of the handle's `close` is the whole of what a tab owns, so it becomes a `teardown` closure and the guard's `onError` calls it. A guard failure and a user closing the tab then release the same things in the same order, which is the only way to be sure the fourth ending releases what the other three do.

2. **The tab session reports, the generation is released silently.** The guard's message is delivered through the tab session, which is the one whose `onGone` the harness installed and the one the human reads. The generation behind it is released without a message, so a browser that was working is not also reported as gone: there was one failure and it has already been said.

3. **Order is the one the eager start's comment already records.** The tab session first, which closes the guard and gives the ports back, then any live generation, which kills the child and removes its own directory. Nothing can ask for a browser while a teardown is in progress, and `lazy.generation` is cleared first so a second call — the guard's error after a close, say — is a no-op.

4. **The eager start is untouched.** Its single session already holds the guard, the child, the scratch and the ports, so its `onError` already releases everything. The two-session split is the lazy start's own doing and this is the hole that opened in it.

## What already exists (reuse, don't rebuild)

| Need | Existing precedent | Location |
| --- | --- | --- |
| The release a tab closing performs | the `close` `startLazyE2EBrowserServer` returns | `src/browser/e2e-server.ts:169` |
| A guard failure reported once, with the child killed and the directory kept | the eager suite's guard case | `src/browser/e2e-server-lifecycle.test.ts:229` |
| Release rules, including which endings keep the scratch directory | `stopSession` | `src/browser/e2e-session.ts:86` |

## Proposed changes

1. **`src/browser/e2e-server.ts`.** Extract the `close` body into a `teardown` closure over `lazy`; the handle becomes `{ close: teardown }` and the guard's `onError` becomes `stopSession(session, message)` followed by `teardown()`. The comments on both move with the code they describe.

2. **Specs.** `product/specs/harness.md` already says a guard that died is one of the reportable endings and that an ending the user did not ask for keeps the browser's scratch directory; nothing there changes. No spec edit is needed, and none is made.

## Tests

- `src/browser/e2e-server-lazy.test.ts`, a `guard failure` block: with a browser started, `guardCall().onError('e2e browser guard failed to listen: EADDRINUSE')` kills the child, removes the live browser's scratch directory, releases both ports, and fires `onGone` once with the guard's own message. With no browser started, the same call releases the ports and fires `onGone` once, and spawns nothing.
- `src/browser/e2e-server-lifecycle.test.ts`'s eager guard case is unchanged and must still pass: the eager start's behavior is not what this fix is about.

## Out of scope

- No change to the guard, the ports, the scratch rule, or what a death reports.
- No change to the eager start's own `onError`.
- No restart budget, and no change to what a later connect does.

## Verification

`./scripts/run.mjs check-diff`.
