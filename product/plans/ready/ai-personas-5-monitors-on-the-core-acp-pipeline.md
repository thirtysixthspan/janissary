# Run monitor sessions through the core ACP pipeline and remove the monitor-style spawner

**Complexity: 5/10** — ~60 added lines across 8 modules (7 monitor modules plus the editor manager's spawner exit), 4 requirements and 6 flush/ask/stop scenarios (p=5.27)

## Goal

Monitors still launch dedicated monitor-style sessions through `spawnMonitorSession`. This subplan moves them onto the same core ACP pipeline as `ask`, `tell` and now editor queries, using the persona's role for the connection. Once both consumers are off it, `spawnMonitorSession` and the per-monitor priming/tool-loop scaffolding around it are deleted. The monitor's own scheduling, framing, context snapshot and suggestion delivery stay intact.

This subplan decomposes `./product/plans/complete/ai-personas.md` and depends on `./product/plans/ready/ai-personas-1-role-directive-format.md`, `./product/plans/ready/ai-personas-2-role-resolution-and-validation.md`, `./product/plans/ready/ai-personas-3-core-role-widening-and-generic-close.md` and `./product/plans/ready/ai-personas-4-editor-queries-on-the-core-acp-pipeline.md`.

## Requirements

1. "Migrate editor agent support to the same acp pipeline that the ask and tell commands use" — applied to the monitor consumer here: every monitor prompt goes through `AcpManager.promptResult` / `AcpManager.run` with the persona's role, and core owns connection and prompt lifecycle.
2. "When the persona is used, the role must be used in the acp connection" — the monitor's connection is the tab's core role connection for the resolved role.
3. "Reuse the core refusal" — a monitor prompt colliding with an active core prompt for the same role settles with the core refusal text and surfaces through the monitor's existing error line; no new queue or cancellation path is added.
4. The launcher opens no connection and still primes only its body; it is unaffected by this subplan.

## Design decisions

- `spawnMonitorSession` is removed from `src/monitor/acp.ts` and that module is deleted once no caller remains; there is no replacement spawner. All monitor prompts use `managers.acp.promptResult` against the owner tab's label and the persona's role (linked to Assumption 1 and Assumption 2).
- The role's own primer replaces the per-persona priming and tool-loop code: the core pipeline sends the role's grant/tooling primer, while the monitor's persona body and `SUGGESTION_FORMAT` framing are prepended to the first prompt so the monitor still knows what to watch and how to reply. Later flushes send only framed batches (linked to Assumption 3).
- `MonitorSub` no longer owns an `AcpSession`; `inFlight` continues to gate flushes and asks, and the existing respawn behaviour becomes a core-session close plus a fresh prompt on the next batch rather than a local process kill (linked to Assumption 4).
- Connection rows for monitors come from the core role enumeration in subplan 3; `monitorConnections` remains as a read-only projection only if it still has meaning, and is otherwise removed with the old session state. The tab's core row is the one shown, with no per-persona row.
- The monitor's target feeds, delimiter framing, byte/context snapshots and suggestion parsing are reused unchanged; this is a transport swap, not a redesign (linked to Assumption 5).
- The role validation from subplan 2 stays at `MonitorManager.start` and continues to run before any prompt is sent.

## Preserved behavior

None found. The four query-line and status-pill behaviors are owned by subplan 4 and are not touched by this subplan.

## Assumptions

1. `MonitorManager.start` currently calls `createMonitorSession` and `primeMonitorSession` from `src/monitor/session.ts` — `src/monitor/manager.ts:62-64`.
2. `spawnMonitorSession` is the only producer of a monitor's `AcpSession`, called from `src/monitor/session.ts:16` and injected as a `spawn` parameter through `src/monitor/manager.ts:30` and `src/monitor/live-monitors.ts:70`.
3. `primeMonitorSession` currently sends `persona.body`, `SUGGESTION_FORMAT` and trust framing as the first prompt — `src/monitor/session.ts:33`.
4. `MonitorSub.session` is an `AcpSession` read directly by the flush, ask and stop paths — `src/monitor/live-monitors.ts:113` (`session.prompt(`), `src/monitor/ask.ts:27` (`reg.session.prompt(`), `src/monitor/stop.ts:29` (`reg.session.kill();`).
5. Framing, context recording and reply parsing live in separate modules (`framing.ts`, `context.ts`, `reply-format.ts`) that do not depend on the spawn mechanism — `src/monitor/live-monitors.ts:11-13`.
6. `AcpManager.promptResult` returns a promise of `AcpPromptResult` with `answered`, `reply` and `error` fields — `src/acp/manager.ts:67`.

## Existing functionality

1. `AcpManager.promptResult` is the core prompt entry point — `src/acp/manager.ts:67` (`promptResult(`).
2. `runCorePrompt` already supplies the role primer and tool loop — `src/acp/run-prompt.ts:110` (`export function runCorePrompt`).
3. `frameUpdatePrompt` already wraps monitored content in the per-session delimiter — `src/monitor/framing.ts` (`export function frameUpdatePrompt`).
4. `recordContext` and `recordReply` already maintain the monitor's context snapshot — `src/monitor/context.ts` (`export function recordContext`) and `src/monitor/reply.ts` (`export function recordReply`).
5. `parseSuggestion` already extracts a deliverable report from a monitor reply — `src/monitor/reply-format.ts` (`export function parseSuggestion`).
6. `notify` already posts `rate-limited` and other consumer notifications — `src/notifications/index.ts` (`export function notify`).

## Implementation steps

1. In `src/monitor/manager.ts`, remove the `spawn` constructor parameter and the `spawnMonitorSession` import, and replace the `createMonitorSession`/`primeMonitorSession` pair in `start` with a registration that records the persona's role and the first prompt without opening a dedicated session. Keep the role validation from subplan 2 before this point. Build command: `$janissary/scripts/run.mjs check-diff`.
2. In `src/monitor/live-monitors.ts`, drop the `spawn` field and the `AcpSession` import, and rewrite `flush` so the batched prompt is sent with `managers.acp.promptResult(reg.owner, prompt, reg.persona.role, { appendRefusalToTranscript: false })`. The core entry point yields one final result rather than a chunk stream: use `result.reply` as the complete reply text, keep `inFlight` set until the promise settles, and parse it with `parseSuggestion` as today. On an error result (including the core refusal), append the existing `monitor <name>: <message> — restarting monitor session` line, post `rate-limited` where applicable, and clear `inFlight` so a later batch can use the core session. Core already owns model fallback, so a failed prompt does not spawn a replacement process here. Build command: `$janissary/scripts/run.mjs check-diff`.
3. In `src/monitor/session.ts`, remove `createMonitorSession`, `primeMonitorSession`, `openMonitorSession` and `respawnMonitorSession`, or reduce the module to the pure first-prompt/format helpers if other monitor modules still import them. In `src/monitor/live-monitors.ts` and `src/monitor/manager.ts`, remove `openSession`/`respawn` methods that only existed to drive the local session. Build command: `$janissary/scripts/run.mjs check-diff`.
4. In `src/monitor/ask.ts`, route `monitor ask` through the same `acp.promptResult` call with the persona's role and use its final `reply`, preserving the `inFlight` sharing and the owner-transcript reply target; on an error result append the existing monitor error line instead of calling a respawn callback. In `src/monitor/stop.ts`, drop `reg.session.kill()`; stopping a monitor leaves the tab's core role session alone and only clears the monitor's timers, subscriptions and registration. For the reporting tab's explicit reset button, replace the old process respawn with `managers.acp.close(owner, undefined, reg.persona.role)` so the next prompt starts a fresh core session. Build command: `$janissary/scripts/run.mjs check-diff`.
5. Clear the last importer before deleting the spawner: `src/editor/acp-manager.ts:4` still imports `spawnMonitorSession` for its `session()` method, which subplan 4 stopped calling. Remove that import, the `session()` method and the now-orphaned `died()`/`hooks` members from `EditorAcpManager`, leaving the class shell, its maps and `connectionsFor`/`close`/`dispose` in place for subplan 6; update `src/editor/acp-manager.test.ts` to drop only those cases. Then delete `src/monitor/acp.ts` and remove `MonitorSub.session` plus the `info` field that existed only to render the old monitor connection line. Keep `monitorConnections` in `src/monitor/info.ts` as a name-only `monitor:<name>` row with its existing monitor-scope `acpRef`, so `connections close monitor:<name>` still stops that monitor; drop its `(provider/model)` suffix because the model now belongs to the core role row from subplan 3. No new row is introduced. Build command: `$janissary/scripts/run.mjs check-diff`.
6. Update the colocated tests named below. Build command for every step: `$janissary/scripts/run.mjs check-diff`; every step leaves the tree green.

## UI design

1. No new surface. A monitor's connection is the owner tab's core `acp:<role>:<provider/model>` row from subplan 3. The existing `monitor:<name>` row remains only as the name-based handle for stopping that monitor; it no longer carries a provider/model suffix or represents a separate session.
2. Reporting-tab suggestion feeds, inline suggestions, the metadata line and the context snapshot tab keep their existing layout, buttons and focus behaviour; only the session behind them changes.
3. No key bindings, colours, badges or CSS change. Monitor errors, including the core refusal, use the existing owner-transcript line and the existing `rate-limited` notification.

## Tests

1. `src/monitor/acp.test.ts` no longer pins `persona.harness` or `persona.tools` forwarding; the module it tested is deleted, so the file is removed and its coverage moves to the core role-session tests (Requirement 1).
2. `src/monitor/manager.test.ts` covers Requirements 1 and 2: starting a monitor with a shipped persona produces prompts under that persona's resolved role through the core entry point, and no monitor-style session is spawned.
3. Core role-session tests in `src/acp/plugin-session.test.ts` (or the core prompt test file) now cover both consumers, including the monitor flush and ask paths (Requirement 1).
4. `src/monitor/live-monitors.test.ts` / the manager flush tests cover Requirement 3: a prompt fired while the role is busy settles with the core refusal text, leaves the active prompt untouched and appends the existing monitor error line.
5. `src/monitor/stop.test.ts` and ask tests are updated so stopping a monitor does not kill the tab's core role session and `monitor ask` uses the core path.

## Out of scope

- Removing the editor-scope `AcpRef`, per-persona rows and `closeEditorConnection` is subplan 6.
- The launcher summarizer is untouched: it still reads only its persona body and opens no connection.
- The prose documentation page remains a follow-up candidate.

## Verification

End with `$janissary/scripts/run.mjs check-diff`. For a concrete end-to-end check against the running app, start a monitor with a shipped persona and confirm its first update and subsequent flushes arrive under the owner tab's core `acp:<role>:<provider/model>` connection, that the connections window shows that same core row and no monitor-style session row, and that the reporting tab's suggestion feed and context snapshot still work. As a second check, fire `monitor ask` while a core prompt for the same role is active and confirm the owner transcript receives the core refusal line without cancelling the active prompt.
