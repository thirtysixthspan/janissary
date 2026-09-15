# Workspaced harness on-demand browser

**Complexity: 6/10** — no new protocol surface (the existing `spawn` frame's `browser` boolean and the `browser-exited` frame already carry everything), but the change spans both sides of the transport: the local capture wiring, a new detector with a rearming state machine, a lazy split of the browser start, typed terminal notices, and a second mount of all three on the remote server, whose side currently has no screen readers of its own.

## Summary

Today `harness <name> -b` starts the tab's e2e browser the moment the harness process spawns, even when the AI never touches it. The backlog entry asks for a different shape: the browser starts only when the harness asks for it, and `-b` remains the gate that makes a browser possible at all. A session that never does browser testing never spawns the Chromium child; one that does can get its browser mid-session with one printed line.

The downstream motivation is actual e2e browser usage: the AI connects from the workspace, drives a real page, and reports back — everything about driving the browser once it is up stays as specced today. The feature's own text establishes the anchor decisions: the capability is a request made by the harness, and the existing `-b`/`--browser` flag keeps its current meaning as the permission but no longer implies an immediate start.

## Design decisions

1. **The request is screen sentinel text.** The AI prints `[janissary: start the e2e browser]` in its own session output; janissary detects the phrase in the rendered-screen capture stream — the same pipeline that detects claude's permission gate (`src/harness/capture-wire.ts` → `HarnessAutoApprover.onCapture` style), so the mechanism is identical to the existing precedent rather than a new channel. Works on all three harnesses' PTYs. The sentinel is matched as rendered-screen text, as it appeared on screen when first seen in the current browser state.

2. **Matching acts once per browser state, then rearms.** Detection reads every capture like auto-approve does. A phrase seen in later captures while the same browser is running (re-prints, echoes, scrollback repaints) is a repeat request with no re-trigger, and no fresh detection ever comes from stale scrollback: matching keys off the persisted phrase-in-state notion, acting when the phrase first appears after the browser state last changed. When the browser is gone, one later print of the phrase is the request that restarts it (decision 4); further prints are repeats. The two states and their replies, per decision 5, therefore cannot loop.

3. **Endpoint delivery: the typed notice, not the environment.** `JANISSARY_BROWSER_WS_ENDPOINT` and `JANISSARY_PLAYWRIGHT` are no longer set in the harness spawn environment — the variables are dropped from the harness's env entirely; the browser's variables store is typed text instead, and the harness's terminal gets the endpoint itself. When the browser comes up, janissary types into the harness's input, as a session message like the `with <prompt>` delivery does, a bracketed line: `[janissary] e2e browser is running — connect to <endpoint> with the Playwright client at <path>`. Tying the endpoint to the notice fixes the fresh-endpoint-on-restart problem: both are typed and happen only once, following the state machine in decision 1.

4. **One guard's shape changes, the browser surface it gates does not.** The browser is always headless, one per tab, never shared or pooled; the guard still refuses `file:` URLs and a close/kill; the metadata-row globe flag still tracks the browser (now appearing on request, disappearing with the gone-browser band). The scratch-dir, port allocation, and confined-child mechanics are the existing ones, started lazily rather than at spawn.

5. **Any `-b` tab can request; the ability is still flagged.** Requests are honored on any tab launched with `-b`, workspaced or not; the sentinel seen on a `-b`-less tab gets the no-reply notice. Since this is a product-text relaxation of "workspaced harnesses", the launch surfaces (command, New harness dialog, profiles) get no new flag: `-b` keeps its single meaning everywhere.

6. **Refusal on a non-`-b` tab is a typed no, so the AI does not retry blind.** `[janissary] e2e browser is not available on this tab`.

7. **A request while the browser is already running is an already-running notice.** `[janissary] e2e browser is already running — connect to <endpoint>` (the endpoint re-stated so the AI does not have to scroll).

8. **A request when the browser already died restarts a fresh browser.** Fresh process, fresh guard state, fresh endpoint, fresh typed notice via decision 3. This is the one deliberate departure from the old never-restart rule; the death reporting (notification + band + log file) is unchanged, and the restart is the reply the old "a later attempt to connect simply fails" wording now loses.

9. **Remote harnesses detect their own requests.** The remote serves the sentinel with its own screen reader (see Proposed changes §5 — the side runs none today), starts its own lazy browser, and types the notices — all locally on the far host, with no protocol change. Remote `-b` tabs simply have their browser provision lazily, exactly like local ones.

## What already exists (reuse, don't rebuild)

| Need | Existing precedent | Location |
| --- | --- | --- |
| The whole e2e browser start path (ports, scratch dir, guard, confined child, env vars) | `startE2EBrowserServer`, run from `harnessSpawnEnv` at spawn time | `src/browser/e2e-server.ts:61`, `src/harness/scratch-dir.ts:38` (`harnessSpawnEnv`) |
| Watching harness rendered-screen output and reacting (approve gates, busy status) | `captureWiring` → `HarnessAutoApprover.onCapture`, whose `lastApprovedText` stand-down loop is the rearm model this plan copies | `src/harness/capture-wire.ts:20` (`captureWiring`), `src/harness/auto-approve.ts:104` (`HarnessAutoApprover.onCapture`) |
| Typing text into a running harness as a delivery mechanism | the `with <prompt>` clause's one-shot schedule entry; the auto-approver's keystroke injection | `product/specs/harness.md` § Launch prompt, `src/pseudoterminal-manager.ts` |
| A screen reader fed from remote bytes (the pattern, not the site — the *remote side* itself has none yet; see §5) | local `HarnessScreenReader` consuming outbound remote `output` frames in a test | `src/remote/pty-session.test.ts:125-136` |
| Reporting a browser that dies (notification + band above terminal + log file) | `HarnessManager.browserGone`, the `e2e-browser-gone` notification kind | `src/harness/manager.ts:254`, `src/notifications.ts` |
| The per-PTY resource owner with one disposal path | `HarnessRuntime`, closed by the `pty`/`exit` subscription | `src/harness/runtime.ts:18` |
| The remote browser table and its close-on-kill/finish paths | `RemoteProcesses.browsers`, `closeBrowser` called from `kill` and `finish` | `src/remote/serve-processes.ts:92-97` |
| The guard refusing `file:` URLs and browser close/kill | `src/browser/e2e-guard.ts`, `e2e-frame-filter.ts` | unchanged |
| The metadata-row globe flag tracking the browser, not the launch flag | tabs.md metadata row | unchanged in meaning |

## Proposed changes

Land as components, ordered so each is self-contained and the tree stays green. §1 through §4 are the local chain (detector routes need the lazy browser from §1 to start); §5 is the remote mount and lands after §1–§4 deliver the pieces it reuses. This plan depends on no other plan landing first.

1. **Lazy browser start.** Same module `src/browser/e2e-server.ts`, not a sibling: `startE2EBrowserServer` gains a lazy counterpart whose contract is the current one minus the immediate start — it allocates nothing (no ports via `allocateBrowserPorts`, no scratch, no guard, no child) and returns an object with a `start()` that runs the exact sequence the current function body runs, exactly once, and an `onGone`-carrying shape like today's. The port-band-full failure (e2e-server.ts:66-72) moves inside that first `start()`: a request on a saturated host reports gone through the same `onGone` path and re-arms the state machine, so a later print retries. `harnessSpawnEnv` (`src/harness/scratch-dir.ts:38`) stops starting a browser and stops returning `handle`; it becomes plain `harnessEnv` again and the non-`-b` path being byte-identical claim becomes about the whole function, for `-b` and otherwise.

2. **Browser state on the runtime.** `HarnessRuntime` gains the on-demand browser fields: the lazy object from §1, a small lifecycle state (`never-requested` | `running` | `gone` | `declined`), and the `onGone` continuity — the existing `browserGone` path already flips the tab band and notification, and it now also records `gone` so the detector re-arms (decision 8). Closing a tab with a browser still running stops the browser as it always did through the existing disposal chain, whether or not it was started on request. `tab.browser` the launch flag and the profile field stay exactly as they are; the state lives beside the handle, not on the tab type.

3. **The request detector.** New module beside `src/harness/auto-approve.ts` in the same shape as `HarnessAutoApprover`: pure phrases, one `onCapture` method, a `route` callback carrying what happened. It matches the sentinel phrase as rendered-screen text per decision 1, and implements the state table per decisions 5–8 using the same per-state act-once-and-rearm loop `lastApprovedText` gives auto-approve — one action per state, never re-triggered by an unchanged screen repeat, rearmed when the state the next request acts on is entered (starting the browser, or the browser going gone). Routes: start, already-running notice, no-browser notice. Wired into `captureWiring` (`src/harness/capture-wire.ts:20`) as a constant third consumer beside the approver and `busyStatusHandler` — a `-b` tab always gets it, so the `handler: undefined` short-circuit must account for it.

4. **The typed notices.** A delivery step reusing the schedule `run`-entry typing path: the bracketed line per decisions 3, 6, and 7 is written into the harness PTY as input, exactly how `with <prompt>` delivers its text (one line, no transcript entries — the harness has none). The endpoint the line carries is formatted from the `env`-shaped pair the lazy browser's `start()` returned (`JANISSARY_BROWSER_WS_ENDPOINT` and `JANISSARY_PLAYWRIGHT`, `src/browser/e2e-server.ts:92-99`), so the two variables' *values* keep their meaning even though the variables themselves are no longer injected into the spawn environment.

5. **Remote.** The remote's side currently has no screen reader of its own (the reader named in the reuse table runs on the *other* host, from `src/remote/pty-session.ts:37`, consuming outbound frames there). So `RemoteProcesses.spawnPty` (`src/remote/serve-processes.ts:52`) gains the three pieces mounted locally on the remote host: its own `HarnessScreenReader` fed from the same `onData` bytes it already relays (the pattern `src/remote/pty-session.test.ts:125-136` shows locally), the detector from §3, and the typed notice written through the existing writers map (`this.writers.get(id)`) rather than a frame. Its lazy browser comes from §1. No protocol change: the `spawn` frame's `browser` boolean and the `browser-exited` frame already carry everything. Both sides of detection are necessary for the same reason the remote already builds its own copy of `harnessSpawnEnv` — only the far side can start and describe its own browser.

6. **Cleanup.** The spec text describing the two variables as the whole surface is replaced in `product/specs/harness.md` with the sentinel contract; `product/specs/sandbox.md`'s description of the variables as injected environment gains the same correction. The `-b` parsing (`src/harness/command-parse.ts:73`) and profile `browser: true` stay exactly as they are — still the gate. The remote `-b` path keeps provisioning lazily too, since both `harnessSpawnEnv` callers get the same §1 change.

## Tests

Mirroring existing colocated conventions, without starting a real Chromium anywhere:

- `src/harness/auto-approve.test.ts` patterns extended for the requested-sentinel detector, colocated beside the gate table tests in its own new test file: the phrase acts exactly once per browser state, no-ops with the already-running reply, gets the no-reply on a tab without `-b`, and re-arms after death so the next print restarts the browser. Unchanged-screen repeats and gate-shaped sentinel text that scrolled up and was repainted are both covered, mirroring the `lastApprovedText` loop's tests.
- `src/browser/e2e-server.test.ts` — lazy start: no child, guard state, ports, or workspace exist until first request; first request creates them; a restarted request creates fresh ones and closes the dead handle's leftovers; close-on-dispose without any request is a no-op; the port-band-full failure reports through `onGone` and re-arms (mirroring e2e-server.ts:66-72).
- `src/harness/scratch-dir.test.ts` — `harnessSpawnEnv` returns exactly `harnessEnv`'s result, for `-b` and otherwise, including `undefined` for a non-claude harness.
- `src/remote/serve-processes.test.ts` — remote-side: a sentinel capture on the far side starts the remote's own browser locally and never a frame; the typed notice is written through the session's writer; kill and natural exit both close the browser (mirroring the existing `closeBrowser` calls).
- The typed-line wording is pinned as literals in the detector tests, since it is user-visible text.

## Out of scope

- The request path stays a sentinel line, not a protocol channel, a new command, or a permissions flow; no request-queueing or dedupe beyond the state machine above.
- No test runner or pass/fail reporting; the surface stays drive-your-own-script — the typed notice plus `JANISSARY_*` variables' replacement is the whole new surface.
- One browser per tab; no pooling, no second browser on a second request while one is alive, no supervisor or auto-restart (a restart only ever comes from a printed request).
- No `-b` changes: the flag, the dialog checkbox, the profile field, and `-b` with `--offline`'s deliberate contradiction all keep their current behavior.
- Agent tabs: no request channel, no browser. Existing precedent.
- A visible (non-headless) browser variant.

## Open questions

None at the time of the last pass; the wording table below is normative and final.

- Sentinel, printed by the AI: `[janissary: start the e2e browser]`
- Browser up, typed by janissary into the harness: `[janissary] e2e browser is running — connect to <endpoint> with the Playwright client at <path>`
- Already running: `[janissary] e2e browser is already running — connect to <endpoint>`
- No browser on this tab: `[janissary] e2e browser is not available on this tab`

## Verification

`./scripts/run.mjs check-diff` after each step.

Manual: launch `harness claude -b -w`, confirm no Chromium child is running after the harness is up and idle. Have the AI print `[janissary: start the e2e browser]` and confirm the terminal receives the bracketed endpoint line, a Chromium child starts, and the globe flag appears in the metadata row. Re-print the sentinel and confirm the already-running notice. Kill the Chromium by hand and confirm the gone-browser notification, band, and log file, then re-print the sentinel and confirm a fresh Chromium, fresh endpoint, and new typed notice. Launch `harness opencode` without `-b`, print the sentinel, and confirm the not-available notice. Close the tab and confirm the Chromium process and scratch directories are gone.
