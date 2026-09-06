# Replace a dead e2e browser instead of losing it for the tab's life

**Complexity: 5/10** — one new module in `src/browser/`, a rewritten tail of `runE2EBrowser`, and no change to the guard, the session, the ports, the scratch directory, or the harness manager. The endpoint and both secret paths are unchanged, so nothing the agent holds has to be reissued.

## Goal

A `-b` tab's browser is unrecoverable once it dies. The child watches its browser server and exits the moment that server closes (`server.on('close', () => process.exit(0))` in `src/browser/e2e-child.ts`), the parent turns that exit into `stopSession(session, 'e2e browser exited')`, and everything the launch acquired is released — guard, ports, scratch directory. The tab keeps advertising `JANISSARY_BROWSER_WS_ENDPOINT`, and every later `connect()` fails against a port nothing is listening on. The backlog issue asks for the browser to outlive a teardown, so one bad moment does not cost the tab its browser for the rest of its life.

Start the replacement instead. A browser that dies is relaunched on the same port under the same secret path, up to a small cap, and only a browser that cannot be replaced ends the child and reports.

## What the reported trigger actually does

The issue names `browser.close()` from a harness script as the way to reach this, by way of "closing the connected browser closes the remote browser". That is not what the pinned Playwright (1.61.1) does, and it is worth recording so the next reader does not go looking for a path that is not there.

Two independent things stop it. `chromium.connect()` sets `_shouldCloseConnectionOnClose` on the returned browser, and `Browser.close()` checks that flag first: it closes the client's own connection and never sends a `close` frame at all. And had it sent one, the server would have ignored it — a `launchServer` connection gets a `BrowserDispatcher` built with `ignoreStopAndKill: true`, whose `close` returns without touching the browser. `browserServer.emit('close')` is wired to `browserProcess.onclose` alone, so it fires when the Chromium process exits and at no other time.

So the guarantee the issue asks for holds today for the trigger it names, by inheritance from Playwright rather than by anything in this repo. What does not hold is the broader case underneath it, which the issue's own closing sentence describes and which the harness spec states outright: *nothing restarts it*. A Chromium that crashes, is killed, or aborts at startup after a successful launch takes the tab's browser with it permanently. That is the defect this plan fixes, and fixing it also makes the narrower guarantee janissary's own rather than a Playwright implementation detail no test in this repo pins.

## Approach

Supervision belongs in the child, not the parent. The child is the only process holding the `BrowserServer` object, it is the only one that can relaunch on the same port and path, and it is already the process whose exit the parent reads as "the browser is gone" — so a browser that comes back never has to be explained to the parent at all. The parent, the guard, the session, and the harness manager are untouched, and `E2EBrowserHandle.close()` still kills the child and takes whatever browser it currently owns with it.

The loop lives in `src/browser/e2e-child-supervisor.ts` rather than in `e2e-child.ts`, with every effect injected: the launcher, the reporting sink, the delay, and the give-up callback. That is what makes it testable without a Chromium — the same reason `e2e-child.test.ts` and `e2e-server.test.ts` already stub `playwright`. The module holds no Playwright import and no `process` reference.

Three bounds, all deliberate:

- **Three replacements per child, counted for its whole life, not consecutively.** A browser that dies repeatedly is broken in a way relaunching will not fix, and a counter that resets would let a slow crash loop run forever. Three is enough to absorb an accident and small enough to notice.
- **Five launch attempts per replacement, 250 ms apart.** Playwright calls `server.close()` and emits `close` in the same statement without awaiting it, so the old listener may still hold the port when the replacement tries to bind. The retry is what makes reusing the same port safe; without it the common case would fail on `EADDRINUSE`.
- **The first launch is not supervised.** `runE2EBrowser` still awaits it and still lets a throw propagate, so a browser that never starts fails exactly as it does today — the parent rolls the session back and reports through `onGone`. Supervision begins only once there is something to supervise.

Every replacement and every failed attempt is written to the child's stderr, which the parent is already tailing into `session.output` (see `src/child-output.ts`). Nothing is delivered at the moment of a successful replacement: the point of the fix is that a browser that came back is not a failure, and the tab's browser flag and gone-browser band both stay clear. But when the child eventually does exit, the message the user reads carries the replacement history underneath it, which is what turns "e2e browser exited" into something actionable.

An agent holding a connection when the browser dies still loses it. There is no way around that — its pages are gone with the process — and the guard's existing behavior applies: the upstream drops, the client socket closes, and the next `connect()` reaches the replacement. The one-retry advice already in `ai/guidelines/sandbox-e2e-browser.md` covers the window while the replacement is binding.

## Implementation steps

1. **`src/browser/e2e-child-supervisor.ts`** (new). Export `MAX_REPLACEMENTS`, `RELAUNCH_ATTEMPTS`, `RELAUNCH_DELAY_MS`, a `SupervisedServer` type (`on(event: 'close', listener: () => void): void` — the slice of Playwright's `BrowserServer` this uses), and:

   ```ts
   export type SuperviseOptions = {
     server: SupervisedServer;
     launch: () => Promise<SupervisedServer>;
     report: (line: string) => void;
     giveUp: (reason: string) => void;
     delay: (ms: number) => Promise<void>;
   };
   export function superviseBrowserServer(options: SuperviseOptions): void;
   ```

   It watches `server` for `close`. On close: if the cap is spent, call `giveUp` and stop. Otherwise report the replacement, run the retry loop, watch whatever it returns, and call `giveUp` when every attempt failed. It never throws to its caller and never touches `process`.

2. **`src/browser/e2e-child.ts`** — extract the `chromium.launchServer({...})` call into a local `launch` closure over `args`, await it once as today, and hand it plus the closure to `superviseBrowserServer`. `report` writes the line and a newline to `process.stderr`. `giveUp` writes the reason the same way and exits from the write callback, so the last line is flushed before the process goes rather than racing the exit. Replaces the current `server.on('close', () => process.exit(0))`.

Run `./scripts/run.mjs check-diff` after each step.

## Tests

`src/browser/e2e-child-supervisor.test.ts` (new) — a fake server records its close listener, a fake `launch` is scripted per call, `delay` resolves immediately:

- leaves everything alone while the server stays up: `launch` is never called
- relaunches once when the server closes, and watches the replacement's close event too
- absorbs a death on the replacement, and on the one after that, up to the cap
- gives up on the death after the cap, without calling `launch` again
- retries a launch that throws and succeeds on a later attempt, keeping that replacement within its single budgeted slot
- gives up when every attempt of one replacement throws, and reports the last error
- reports one line per replacement and one per failed attempt, so the parent's output tail carries the history
- waits `RELAUNCH_DELAY_MS` before each attempt, since the old server may still hold the port

`src/browser/e2e-child.test.ts` (existing, `playwright` already stubbed):

- a replacement launches with byte-identical options to the first: same port, same `wsPath`, same host, same downloads path — the endpoint the tab advertises must keep working
- the child no longer exits on the first close: the stubbed server's close listener fires and `launchServer` is called a second time

## Spec updates

`product/specs/harness.md`, in the End-to-end browser section:

- "Nothing restarts it; a later attempt to connect simply fails." is now wrong. Replace it with the replacement behavior: a browser that dies is relaunched on the same endpoint up to three times per tab, connections open at that moment are lost, and the next `connect()` reaches the replacement.
- State that a replaced browser is not reported — no notification, no band on the tab, and the metadata row's browser flag stays lit — and that the report still arrives, unchanged, once the browser cannot be replaced again, now carrying the replacement history in the lines beneath it.

`product/specs/tabs.md` needs nothing: the browser flag's rule (lit until `browserError` is set) already produces the right behavior for a replacement, because no `browserError` is written.

## Docs

- `documentation/user-documentation/advanced-agents/harness.md` says "Nothing restarts it, and a later connection attempt simply fails." Correct it in place, and adjust the sentence above it that promises news in two places, since a replaced browser produces neither.
- `ai/guidelines/sandbox-e2e-browser.md` is the operating manual handed to the agent driving the browser, and its "When it stops working" section states "There is no supervisor and nothing restarts it." That is the exact sentence this change falsifies, and an agent that believes it will report a dead browser instead of reconnecting. Correct it and say that one retry now also covers a browser being replaced.
- `help.md` does not mention `-b` or the browser's lifetime. Nothing to change.

## Out of scope

- Reissuing the endpoint or either secret path on a replacement. Both are the tab's for its whole life, the guard dials the internal one on every new client connection, and rotating them would mean pushing a new environment variable into a harness that is already running.
- Telling the agent that its browser was replaced. There is no channel to it but the protocol connection, which is exactly what the death destroyed.
- Restarting the guard, reallocating ports, or replacing the scratch directory. None of them died; only the browser did.
- The parent's rollback, notification wording, and exactly-once behavior in `src/browser/e2e-session.ts`. A child that exits still means the browser is gone, which is what that code already says.
