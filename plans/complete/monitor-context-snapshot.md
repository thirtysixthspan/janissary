# Feature: open a snapshot of a monitor's current context from its metadata line

**Complexity: 5/10** — spans server and client, but leans entirely on existing patterns: context accumulation mirrors the four places `contextBytes` is already tracked (collapsed behind one `recordContext` helper), and the snapshot reuses the `harness capture` path (`writeCaptureFile` + `openFile.edit`) to open the text in an **editor tab, which already scrolls with arrows / page keys / mouse wheel** — so there is no new view type and no new scroll code. One new RPC, one new button.

## Goal

A monitor's reporting-tab metadata line (persona, targets, context byte-count, reset button) gains a right-aligned button that opens a scrollable text view of the monitor's **current context** — the actual accumulated content whose size the adjacent byte counter already reports. Clicking it opens an editor tab containing that context, which the user can scroll with Arrow Up/Down, Page Up/Down, and the mouse wheel (the editor tab's existing behavior).

"The agent's current context" is read as the **monitor agent's** own ACP context (persona priming + every batched update prompt + every ask + every reply) — exactly what `contextBytes` on the same line measures. The button reveals that content, not just its size.

## Approach

**Accumulate the context text.** Today only `contextBytes` is kept; the text lives in the ACP subprocess. Add `contextText: string[]` to `MonitorSub` and a `recordContext(reg, text)` helper that increments `contextBytes` *and* pushes the text. Replace the four existing `reg.contextBytes += Buffer.byteLength(text, 'utf8')` sites with `recordContext(reg, text)`:
- `monitor-session.ts` — persona priming (also the reset point: a respawn clears `contextText` to `[]` alongside `contextBytes = 0`, then priming re-seeds it).
- `monitor-manager.ts` `flush` — the batched update prompt.
- `monitor-ask.ts` — an ask prompt.
- `monitor-reply.ts` — a completed reply.

**Snapshot to an editor tab.** A `MonitorManager.snapshotContext(name)` finds the (external) monitor feeding reporting tab `name` — the same `!inline && persona.name === name` filter `resetContext` uses — joins its `contextText` with blank lines, writes it with `writeCaptureFile(name, Date.now(), text)`, and opens it via `openFile.edit('monitor context <name>', file, cur().label)`, exactly like `harness capture`. No monitor or empty context → no-op (priming always seeds context, so this is only the defensive path).

**Wire the RPC and button.** New `{ method: 'monitorContextSnapshot'; params: { name } }` on `RpcCall`, dispatched through `message-handler` → `controller.monitorContextSnapshot(name)` → `managers.monitor.snapshotContext(name)`, mirroring `resetMonitorContext`. The client button lives in `MonitorTab`'s existing right-aligned `.monitor-actions` next to the reset button, calling a new `onSnapshot` prop; `ReportingSection` binds it to the reporting tab's label and `App` sends the RPC — all mirroring the `onReset`/`resetMonitorContext` wiring.

## Implementation steps

1. `src/monitor-context.ts` (new): `recordContext(reg, text)`. Add `contextText: string[]` to `MonitorSub` and initialise it in `start()`.
2. Swap the four `contextBytes +=` sites to `recordContext(...)`; clear `contextText` on respawn.
3. `MonitorManager.snapshotContext(name)`: find the monitor, join, `writeCaptureFile`, `openFile.edit`.
4. `protocol.ts` RPC + `message-handler.ts` + `controller.ts` dispatch.
5. `MonitorTab.tsx` snapshot button + `onSnapshot` prop; `ReportingSection.tsx` `onSnapshot` prop; `App.tsx` RPC wiring.
6. Run `./scripts/run.mjs check-diff` after each chunk.

## Tests

- **`src/monitor-manager.test.ts`**: after priming and a flush+reply, `snapshotContext(name)` calls `writeCaptureFile` with text that contains the persona priming and the flushed update, and calls `openFile.edit` to open it; an unknown name is a no-op. (Adds an `openFile.edit` spy and `cur()` to the fake managers, and mocks `./harness-capture-file.js`.)
- **`web/src/MonitorTab.test.tsx`**: the snapshot button invokes `onSnapshot`.

## Out of scope

- A dedicated read-only "context view" component — reuse the editor tab (as `harness capture` does); it already scrolls with arrows/page/wheel.
- Snapshotting the *monitored* target tabs' contexts, or a live-updating view — this is a point-in-time snapshot of the monitor agent's own context.
- Persisting the snapshot file beyond the normal captures-directory lifecycle (cleared on next launch, like harness captures).
- Inline monitors (no reporting tab, so no metadata line / button).

## Verification

- `./scripts/run.mjs check-diff` passes; the full gate (incl. CSS lint) passes.
- Manual: start an external monitor (`monitor <persona> <target>`), let it prime/flush, click the new button on its reporting-tab metadata line, and confirm an editor tab opens with the accumulated context and scrolls with arrows/page/wheel. Not runnable headless here; covered by the server snapshot test and the button test.
