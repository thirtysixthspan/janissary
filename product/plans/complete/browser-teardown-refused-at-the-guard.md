# Plan: Refuse a browser teardown at the guard

**Complexity: 3/10** — one matching rule in the existing pure frame filter, its cases, and the same decision pinned over two real sockets. No new module, no lifecycle change, and nothing that relaunches anything.

## Goal

The backlog issue asks that a `-b` tab's browser outlive a client disconnect, so one bad teardown from a harness script does not cost the tab its browser for the rest of its life.

Today it does outlive one — but only by inheritance from two Playwright internals that nothing in this repo pins:

- `chromium.connect()` sets `_shouldCloseConnectionOnClose` on the browser it returns, so `Browser.close()` closes the client's own socket and never sends a `close` frame at all (`playwright-core@1.61.1`, `lib/coreBundle.js:61099-61105` and `:61155`).
- A `launchServer` endpoint builds its `BrowserDispatcher` with `ignoreStopAndKill: true`, so a `close` or `killForTests` frame that *is* sent — by a client that is not Playwright's own — is discarded server-side (`:54113-54121`, `:54899`).

Both are Playwright's choices, made for Playwright's reasons, and either could change in a version bump. The guard in front of the browser is the one place in this system that decides what a sandboxed harness may ask the browser to do, and it currently has no opinion on being asked to end the browser. That is the gap: the guarantee the issue wants is real but unowned, unenforced, and untested.

The `-b` browser is not the harness's to end. It belongs to the tab, is torn down when the tab closes, and is the only browser that tab will ever get. A guest asking for it to be closed should be refused by the thing that exists to refuse — not by luck.

## Approach

Add one rule to the client-to-browser direction of the existing frame filter: a frame addressed to the **browser object** whose method is `close` or `killForTests` is blocked, and blocking ends the session the way every other match does.

The frame alone says which object it addresses, with no session state to keep. Playwright builds every dispatcher guid from a type prefix — `SdkObject`'s constructor is `` `${guidPrefix}@${createGuid()}` `` (`:12392`) — and the `Browser` server object passes `browser` (`:51316`) while a context passes `browser-context` (`:50300`). So `browser@…` names the browser and nothing else: `browser-context@…` and `browser-type@…` do not share the prefix, and a page or frame guid is not close to it. The rule stays as pure and as stateless as the `file:` rule beside it.

Only the outbound direction gets the rule. Playwright sends the browser's own `close` **event** back to the client under that same guid and method (`BrowserDispatcher._didClose` dispatches `close`, `:54080`), and that frame has to relay — a client that is never told its browser died is worse off than one that is. `inspectServerFrame` is left exactly as it is.

Ending the session, rather than dropping the one frame, is the right refusal and matches the guard's existing shape: on a match the client's socket closes with 1008 and the upstream connection is destroyed. From the guest's side that is a disconnect, which is precisely what `browser.close()` already means over a `connect()` endpoint — so a future Playwright that did start sending the frame would get the current behaviour back, not an error. `Browser.close()` swallows a target-closed error and returns cleanly (`:61106-61109`).

Nothing about the browser's lifecycle changes. No process is relaunched, no resource is held past its release, and the parent's teardown path is untouched.

## Implementation steps

1. `src/browser/e2e-frame-filter.ts` — add the browser-guid prefix and the teardown method set as named constants, a small `isBrowserTeardown` predicate reading `guid` and `method` off the parsed frame, and the check in `inspectClientFrame` ahead of the `file:` walk. Comment it with why the guid prefix is readable from the frame alone and why the rule is one-directional.
2. Run `./scripts/run.mjs check-diff`.

## Tests

- `src/browser/e2e-frame-filter.test.ts` — a new `inspectClientFrame` group:
  - `{"guid":"browser@…","method":"close"}` and `…"method":"killForTests"` are blocked, with the reason.
  - `browser-context@…` with `close` is **allowed** — closing a context is ordinary work every script does between shots, and this is the case a prefix match could get wrong.
  - `page@…` with `close` is allowed, and `browser@…` with `newContext` is allowed, so the rule is neither method-blind nor guid-blind.
  - A frame with a `close` method and no guid at all is allowed, so the rule cannot fire on a shape it cannot attribute.
  - `inspectServerFrame` on the identical `browser@…`/`close` frame is allowed, pinning that the browser's own close event relays back.
- `src/browser/e2e-guard.test.ts` — the same decision over two real sockets: a client sending the browser `close` frame is closed with 1008 and the stub upstream receives nothing, so the refusal happens in front of the browser rather than after it. A context `close` frame relays through to the stub untouched.

## Spec and documentation

- `product/specs/sandbox.md` — the protocol guard paragraph lists what ends a session. It gains the teardown rule beside the `file:` one, stated as what it is: the tab's browser is not the harness's to end.
- `product/specs/harness.md` — the `-b` section says the guard "refuses `file:` URLs". It gains the second refusal and the reason the browser survives it.
- `ai/guidelines/sandbox-e2e-browser.md` — "What will end your session" lists the two existing causes for the agent driving the browser. It gains the third, and says plainly that the browser survives it, so an agent that closes its client does not report a lost browser.
- `documentation/user-documentation/advanced-agents/harness.md` — updated only where it already describes what the guard refuses.

## Out of scope

- **Replacing a browser that dies on its own.** A Chromium that crashes or is killed still takes its child, its guard, its ports, and its scratch directory with it, and the tab does not get another. That is what #987 built and #989 reverted this morning, after the documentation screenshot pipeline broke in a way the revert did not root-cause: a relaunch fires only on the browser server's `close` event, which Playwright wires to the browser process exiting and nothing else, yet the pipeline works on master — so the failure is not yet explained, and no second attempt should be made until it is. That work needs an empirical repro of a capture run against a real Chromium in a `-b` workspace, which this change deliberately does not attempt.
- Any change to the guard's session model — it stays one upstream connection per client connection, with no state carried between them.
- The other bypass classes at this boundary. This closes one specific request the guard had no opinion on; it does not claim the filter is complete.
