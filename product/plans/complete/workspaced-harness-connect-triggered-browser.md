# Workspaced harness connect-triggered browser

**Complexity: 4/10** — smaller than the sentinel plan it supersedes because the request detector, the capture-wiring change, and the typed notices all vanish: what remains is a dialing change and a lazy variant of an existing start sequence in one module (`src/browser/e2e-server.ts`), whose span (local + remote) is already carried by a shared builder both sides call. The risk concentrates in the guard's one new behavior: holding a handshake toward a child that does not exist yet.

## Summary

Today `harness <name> -b` starts the tab's e2e browser the moment the harness process spawns, even when the AI never touches it. This plan moves the start to where the AI already is: the AI's first client connect to the published browser endpoint *is* the spin-up request. Janissary starts only the guard at launch — the confined Chromium child behind it comes and goes on demand — and the existing `-b`/`--browser` flag keeps its meaning, now as "this tab may have a browser when it asks for one." This plan supersedes `product/plans/draft/workspaced-harness-on-demand-browser.md`, which carried the same product decisions through a screen-sentinel trigger; the guard replaces the sentinel, and the sentinel plan's typed notices and detection state machine are deliberately dropped.

The shape that makes this small is already half-built: the guard's bridge buffers client frames until the upstream opens (`src/browser/e2e-guard.ts:51-80`, the `pending` array), so a connect arriving before the browser exists would already be handled patiently if the guard's upstream could be brought up on demand. Making the upstream appear *on* that first patient connect is the whole feature.

## Design decisions

1. **The guard listens from launch; the browser child is what goes lazy.** A `-b` tab starts its guard at spawn (publishing a stable `JANISSARY_BROWSER_WS_ENDPOINT` and `JANISSARY_PLAYWRIGHT`) and starts no Chromium. The published endpoint therefore never changes across spin ups, deaths, or restarts — the thing behind it does.

2. **The env variables are set at launch, exactly as today.** The original two-variable contract is restored unchanged, and the fresh-endpoint-on-restart problem that pushed the sentinel plan to drop the variables simply does not exist here, because decision 1 makes the endpoint permanent. The user-visible contract in `product/specs/harness.md` keeps "the two variables are the surface" and only gains the *when*: the browser comes up behind them when the AI first connects.

3. **The first client connect is the spin-up request.** The AI's `chromium.connect(JANISSARY_BROWSER_WS_ENDPOINT)` arriving at the guard while the child is not running makes janissary start one. There is no sentinel text, no control-frame verb, no request grammar added to the filter — the already-legal client frame decides, and the connect's success or failure is itself the answer. Nothing is ever typed into the harness terminal; the typed notices from the superseded plan are dropped entirely.

4. **The guard outlives the child.** A child that dies stops being served (its live upstream connections close, same as today) while the guard keeps listening on the same published port and path. The AI's next connect restarts a fresh child — a new process and a new scratch directory — behind the unchanged published endpoint, and behind the same private port and path inside the guard, which belong to the tab for as long as it is open. This is the one deliberate departure from the old never-restart rule, and the death reporting (notification + band + log file) is unchanged when the child goes.

5. **The first generation stays patient.** While a child is starting, the guard holds the client's handshake and buffers its frames (the mechanism `bridge` already has), with single-flight so two racing connects resolve into one child start and each gets its own upstream session once it comes up.

6. **A launch failure is reported the old way, and never closes the door.** If the child cannot start (port band taken by another process at bind time, Chromium dying at startup, a sandbox profile that will not compile), the held connect's session is closed with the reason on it, `onGone` delivers the ordinary death report (notification + band + log), the guard stays listening, and a later connect simply retries. A tab's first connect failing does not consume anything — including the browser's put-to-spawn state.

7. **The `-b` gate is the endpoint's presence.** A tab launched without `-b` has no guard, no endpoint, and no env variables — the request can never reach janissary because there is nothing to connect to. The refusal needs no typed reply (nothing to reply to); the absence of `JANISSARY_BROWSER_WS_ENDPOINT` *is* the gate, the guidelines document says so, and `-b` keeps its single meaning across all three launch surfaces.

8. **Any `-b` tab, workspaced or not.** Overriding the sentinel plan's "workspaced only" reading of the feature text: `-b` works with or without `-w` today, keeps working, and requests (first connects) are honored on any `-b` tab, workspaced or not — with the request mechanism changed from "print a sentinel" to "make a connect," the isolation distinction loses its purpose, since a connect from a non-workspaced tab is precisely as harmless as one from a workspaced tab.

9. **Remote harnesses run the same machinery locally on the far side.** `RemoteProcesses.spawnPty` stays a caller of the same lazy builder through that side's own copy of `harnessSpawnEnv`; the remote's guard lazily respawns *its* children from *its* remote client's connects. No protocol change: the `spawn` frame's `browser` boolean stays the gate and the `browser-exited` frame already carries the reporting.

10. **The `file:` refusal, close/kill refusal, and state of containment hold.** The guard's `TEARDOWN_METHODS` and `file:` refusal are untouched: spin-down is not a feature, so the AI cannot stop the browser; only spin-up on request exists, and the AI's browser never goes away because a session did — a session loss is still a session loss, not a browser death.

## What already exists (reuse, don't rebuild)

| Need | Existing precedent | Location |
| --- | --- | --- |
| A websocket server with a client-frames-buffered-until-upstream-is-open bridge | `bridge`'s `pending` array | `src/browser/e2e-guard.ts:51-80` |
| The entire browser start sequence (ports, scratch, guard, confined child, env) | `startE2EBrowserServer` + session struct | `src/browser/e2e-server.ts:61-99` |
| The confined child with its sandbox profile and tmp overrides | `spawnBrowserChild` via `sandboxSpawn` | `src/browser/e2e-server.ts:106-171` |
| Port reservation that is released but re-reserved on failure, not silently pooled | `allocateBrowserPorts` | `src/browser/e2e-ports.ts` |
| Death report with message/log split, delivered from one callback | `onGone(message, log?)` | `src/browser/e2e-server.ts:37-48` |
| Single-author close-safe handle ownership and dispose paths | `E2EBrowserHandle.close`, `HarnessRuntime` disposal, `RemoteProcesses.closeBrowser` | `src/browser/e2e-server.ts:21-27`, `src/harness/runtime.ts:18`, `src/remote/serve-processes.ts:92-97` |
| The two env variables the AI reads | `startE2EBrowserServer`'s returned env | `src/browser/e2e-server.ts:92-99` |
| The remote path where `browser` arrives as a fact and builds its own copy | `RemoteProcesses.spawnPty` calling `harnessSpawnEnv` | `src/remote/serve-processes.ts:57-64` |
| The browser-exited frame | `ServerFrame`'s `browser-exited` | `src/remote/protocol.ts` |
| Globe flag tracking the running browser | Metadata-row flag icons, tabs.md | unchanged |

## Proposed changes

Depends on no other plan. Order keeps the tree green: §1 (guard changes) and §2 (server lazy mode) land first because nothing else compiles against them yet; §3 (harness env) and §4 (remote) land on top, unchanged at their call sites of the builder from §2 they call.

1. **`src/browser/e2e-guard.ts` — the guard defers its dialing.** One option changes shape: where `E2EGuardOptions` today carries a static `upstreamPort`/`upstreamPath` paired at construction, the guard instead asks a supplier, `ensureUpstream(): Promise<string>` returning the live upstream URL, before each `bridge()`'s dial. On each incoming client upgrade the server calls it; while it is unresolved the bridge holds the client's handshake and buffers its frames in the `pending` array it already has; on resolve it dials the returned URL and relays as today; on reject it closes the client session with the reason the rejection carries and keeps listening. The frame filter, `file:`/teardown refusals, path binding, and close semantics are unchanged — the only new judgment the bridge makes is *when* to dial, not *which* frames pass.

2. **`src/browser/e2e-server.ts` — lazy mode.** `startE2EBrowserServer` keeps its eager contract; the lazy variant reuses the same `session` struct and helpers with two steps inverted: the guard starts at launch (ports and both `wsPath` tokens minted then; `allocateBrowserScratch` and `spawnBrowserChild` move into an internal `startChild()` invoked from the guard's `ensureUpstream` supplier), single-flight — one in-flight start serves every concurrent connect — and idempotent once a child is running. Child death reuses the existing `stopSession` path for the child itself: its report, log tail, and dead-scratch-kept evidence rule are exactly today's, the guard is *not* closed, `onGone` fires once, and the next `ensureUpstream` allocates a fresh scratch (per generation; the existing "a later start sweeps it" rule governs any accumulation) and spawns a fresh child. `handle.close()` stops the guard and any live child as today, before or after the first start. No new state class; the session struct gains only the single-flight start promise.

3. **`src/harness/scratch-dir.ts` — callers unchanged.** `harnessSpawnEnv` (`:38`) keeps its exact signature and calls the lazy variant instead of the eager one; `HarnessRuntime`'s ownership and the local handle hand-off are byte-for-byte today. No change in `src/harness/manager.ts`, the web client, or the metadata-row flag logic — the globe icon tracks the browser the moment it starts, within the same update stream it already listens on.

4. **`src/remote/serve-processes.ts` — the same builder, same call site.** `frame.browser` starting the remote's own guard is the existing `harnessSpawnEnv` call with no signature change (§3); the browser map's `kill`/`finish`/throw paths close guard-plus-live-child through the same `E2EBrowserHandle.close()`, now safe in the unstarted state it was already documented to tolerate (`src/browser/e2e-server.ts:21-27`). No new or changed frame type.

5. **Docs.** The superseded plan's spec edits are *not* applied. Instead: `product/specs/harness.md`'s e2e section gains two sentences (the browser comes up on the AI's first client connect; the next connect after a browser's death spawns a fresh browser behind the same endpoint) and its "two variables are the surface" contract text stays; `product/specs/sandbox.md`'s browser description matches; `ai/guidelines/sandbox-e2e-browser.md` gains "the first connect is the request, and it is patient while the browser starts" alongside the existing one-retry note, now scoped to the failure case rather than the ordinary first connect.

## Tests

Existing colocated conventions; no test starts a real Chromium:

- `src/browser/e2e-guard.test.ts` — the bridge's dialing is the supplied `ensureUpstream` promise: a client connecting while the promise is unresolved sees its first frames buffered and forwarded in order after it resolves (the `pending` path); a rejecting promise closes that client session with its rejection as the close reason and the guard keeps listening for the next client; every existing filter-refusal and path-refusal test is unchanged.
- `src/browser/e2e-server.test.ts` — the lazy path through the guard: at creation only the guard exists and the env is already complete; the first inbound connect triggers scratch + child and its held frames are relayed; a connect racing one that is starting joins the single-flight; a child death fires `onGone` once, leaves the guard listening, and the next connect gets a fresh scratch and child; `close()` before any start is a no-op, after start ordinary.
- `src/harness/scratch-dir.test.ts` — `browser: true` returns both variables and a close-safe handle; `browser: false` is byte-identical to `harnessEnv`.
- `src/remote/serve-processes.test.ts` — `frame.browser` on the far side starts only the guard; the child waits for an inbound connect; `kill`, `finish`, and the spawn-throw path close guard and child (started or not), extending the existing `closeBrowser` tests.
- No test starts a real Chromium; the manual check below is the only place a real browser runs, as today.

## Out of scope

- No sentinel text, no detection module, no capture-wiring change, no typed notices — those belong to the superseded plan and are intentionally not carried here.
- No control-frame verbs, no spin-down, no `TEARDOWN_METHODS` change, no pooling across tabs, no request-by-schedule.
- No restart at client disconnect: a client's own close ends its session only, never the child (matching today deliberately).
- No typed refusal is added for tabs without `-b` — the absent endpoint (decision 7) is the gate.
- No `-b` flag, dialog, or profile change; `-b` with `--offline` is left deliberately contradictory as today. The flag gates the capability; the connect decides the start.

## Verification

`./scripts/run.mjs check-diff` after each step.

Manual: launch `harness claude -b -w`; before the AI acts, confirm `JANISSARY_BROWSER_WS_ENDPOINT` and `JANISSARY_PLAYWRIGHT` are set, no Chromium process exists, and the guard port is listening. Have the AI connect — confirm the connect resolves (patient, not instantaneous), a Chromium child appears, and the globe flag arrives in the metadata row. Kill the child; confirm the notification, the band, and the log file, then connect again and confirm a fresh child and a working session behind the same endpoint. Launch `harness opencode` (no `-b`) and confirm no endpoint env var, no guard listener, and that its Playwright-less script fails plainly at the connect. Close a `-b` tab with a live browser and confirm the process and scratch directories end with it.
