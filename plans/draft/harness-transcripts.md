# Harness Tab Transcripts

**Complexity: 4/10** — small, well-precedented feature (append-only log reuse, `Transcript.tsx` reuse, `ReportingSection`-style resize handle), but correctness depends on getting the PTY-chunk-to-`LogEntry` batching right (see the spacer landmine below) and wiring capture at the correct call site among several PTY consumers.

## Summary

Give harness tabs a transcript that records harness output. When a harness (claude, opencode, codex, or an SSH session) is running, its stdout/stderr is captured into a `LogEntry[]` buffer identical in structure to agent transcripts. The transcript is rendered in a scrollable panel below the PTY view, with the PTY and transcript split vertically via a resize handle. The transcript is ephemeral (memory-only, not persisted) and cleared when the harness tab closes.

## Decisions (to be confirmed with user)

1. **Transcript model: append-only log, same structure as agent transcripts, batched per PTY chunk — never one `LogEntry` per line.** Harness transcripts use the same `LogEntry[]` type as agent tabs, with `input: ''` (no user command). **Critically, each `LogEntry` must hold multiple newline-joined output lines, not one line per entry.** `flattenBuffer`'s `handleInputOutput` (`src/tab-formatting-handlers.ts:54-76`) inserts a `{ type: 'spacer' }` `BufferLine` before every `LogEntry` once `lines.length > 0` — but *within* a single entry, `entry.output.split('\n')` already renders each line as its own `BufferLine` with **no spacer between them** (`:70-72`). So one `LogEntry` per PTY line would put a blank spacer line between every single line of harness output; one `LogEntry` per PTY chunk (batching all complete lines extracted from that chunk, joined with `'\n'`) renders as continuous output with no visible gap, matching how `ShellManager.run` accumulates a command's streamed output into one growing `LogEntry.output` string (`src/shell-manager.ts:58-97`) rather than one entry per line. This reuses the existing `flattenBuffer()` / `BufferLine[]` pipeline without any new types.
2. **Layout: split view, PTY above, transcript below, inside `HarnessTab.tsx`.** `HarnessTab.tsx` (`web/src/HarnessTab.tsx`, 41 lines) is the component that owns the harness tab body (`.harness-body`); it is mounted by `MountedViewLayers.tsx` (not `ShellTabLayer.tsx` — that layer is unrelated, it only renders inline full-tab PTY takeovers on ordinary agent tabs, gated on `!t.view && t.activePty`, see `web/src/ShellTabLayer.tsx:18`). The split lives inside `HarnessTab.tsx` itself: the xterm container occupies the top portion (default 70%), a transcript panel the bottom (30%), separated by a draggable resize handle copying the `onDividerDown` pattern from `ReportingSection.tsx:36-47` (`mousedown` → add `mousemove`/`mouseup` listeners → clamp → `useState`), substituting `clientY` for vertical sizing. The handle defaults to the 70/30 split; the user can drag it to change the ratio.
3. **Capture wiring lives in `HarnessManager`/`PseudoterminalManager`, not a new gate elsewhere — this also yields the SSH exclusion for free.** `PseudoterminalManager.spawn()` (`src/pseudoterminal-manager.ts:20-27`) is shared by three callers: `HarnessManager.spawnTab` (`src/harness-manager.ts:70`, named harnesses), `SshManager` (`src/ssh-manager.ts:36`), and `PseudoterminalManager.openInlinePty` (`:51-59`, inline terminal cards / full-tab interactive takeovers on ordinary agent tabs). Transcript capture must only apply to the harness case, so gate it on the owning tab: `tab.view === 'harness' && tab.harness?.name !== 'ssh'` — this is the exact idiomatic check already used elsewhere for the same distinction (`web/src/MountedViewLayers.tsx:30`, `src/connection-manager.ts:17,37,71`; prefer this over checking `HarnessView.destination`, which is only set for ssh tabs but isn't the codebase's chosen discriminant). Concretely: extend the `onData` callback inside `spawn()` (`:21-24`) to, after emitting the existing `pty` message-bus event, look up the owning tab (`this.managers.tab.tabs.find((t) => t.harness?.ptyId === id)`) and — only when it passes the gate above — line-buffer the chunk and call `this.managers.tab.append(tab.label, { input: '', output: <joined complete lines> })` (`TabManager.append`, `src/tab-manager.ts:208-219`, which already handles the `transcriptMaxLines` FIFO cap and the `entry:appended`/`state:dirty` events — do not reimplement capping). Held partial-line state (text after the last `\n` in a chunk) lives in a new `private harnessLineBuffers = new Map<string, string>()` on `PseudoterminalManager`, keyed by PTY id, flushed as a final entry and deleted in `handleExit` (`:74-98`) when the harness process exits.
   - Known small gap: `HarnessManager.spawnTab` (`src/harness-manager.ts:70-72`) only assigns `liveTab.harness.ptyId = id` *after* `pty.spawn()` returns, so any PTY data that arrives before that synchronous assignment completes (in practice, none — real process output is never available before the spawning call returns) would fail the tab lookup and be silently dropped from the transcript only, not from the live terminal. Acceptable; do not add complexity to close this window.
4. **Ephemeral storage.** Harness transcripts are not persisted to disk. When the harness tab closes (PTY exits), the transcript is gone. This matches the existing harness lifecycle (fire-and-forget, no `--relaunch`).
5. **No transcript during SSH sessions (v1).** v1 applies to named harnesses (claude, opencode, codex). SSH harness tabs (`view: 'harness'` with `harness.name === 'ssh'`) keep their current behavior (PTY-only, no transcript) — enforced by the gate in decision 3 above, not a separate check. This can be extended in v2.
6. **Side effect: harness tabs become eligible for the unread badge.** `TabManager.append()` already calls `markUnread()` internally (see `plans/complete/unread-badge.md`, which explicitly lists harness/PTY tabs as out of scope for that feature *because* they bypassed `append`). Once harness transcript capture routes through `append()`, an inactive harness tab producing output will pick up the ✨ unread badge automatically. This is desirable and requires no extra work, but is a real behavior change worth calling out — not a bug to fix.

## Verified codebase facts that shape the design

- **Transcript rendering is already generic.** `Transcript.tsx` (`web/src/Transcript.tsx`) renders `BufferLine[]`, handles stick-to-bottom auto-scroll on `lines` changes, and shows an empty state — reuse the component directly (see decision 2 below and "What already exists"); don't build a parallel `HarnessTranscriptPanel.tsx`.
- **PTY data already flows through the server.** `PseudoterminalManager` emits `data` events (`src/pseudoterminal-manager.ts:22`) that are forwarded to the client as `PtyDataEvent` chunks via `controller.ts:58-59`. The server can buffer these into `LogEntry[]` by accumulating lines — see decision 3 for exactly where.
- **Harness tabs already have a `log` field — it's just unpopulated.** `Tab.log: LogEntry[]` (`src/types.ts:164`) is present on every tab regardless of `view`, defaulted to `[]` in `makeTab`/`makeHarnessTab` (`src/tab.ts:6`). There is no type change needed; the work is populating `tab.log` for harness tabs, not adding the field. `HarnessView` itself (`src/types.ts:58-61`) is unrelated — it carries only PTY/display metadata (`{ name, program, ptyId, status, exitCode?, destination? }`), not the transcript.
- **`flattenBuffer` is already called unconditionally for every tab.** `TabManager.view()` calls `flattenBuffer(t.log, ...)` for all tabs with no `view` check (`src/tab-manager.ts:273`). Harness tabs currently produce empty `bufferLines` only because `tab.log` stays empty — populating it via `TabManager.append()` (decision 3) requires no change to `view()` or the protocol.
- **The `--workspace` flag on harnesses implies a running build/test process.** Captured transcript data lets the user scroll back through output without switching to a separate log file — it makes the harness tab self-contained.
- **Resize handles have a well-established pattern.** `ReportingSection.tsx:36-47` demonstrates vertical resize with mouse drag (`onDividerDown` pattern: `mousedown` → add `mousemove`/`mouseup` listeners → clamp → store in `useState`). The harness transcript split copies this pattern, swapping `clientY` for vertical sizing.
- **Line buffering must batch by chunk, not by line — see decision 1.** Node.js PTY output arrives in chunks, not lines. The server splits each chunk on `\n`; all complete lines from one chunk become **one** `LogEntry` (joined by `'\n'`), never one `LogEntry` per line. Incomplete final lines are held in a per-PTY-id buffer and prepended to the next chunk.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| `Tab.log` field (already present, just unpopulated for harness tabs) | `src/types.ts:164` |
| `TabManager.append()` — the entry-append + cap + event-emit mechanism to reuse | `src/tab-manager.ts:208-219` |
| `TabManager.view()` → `flattenBuffer()` (already unconditional, no change needed) | `src/tab-manager.ts:273` |
| Spacer-per-entry rendering rule (the landmine — see decision 1) | `src/tab-formatting-handlers.ts:54-76` |
| Streamed-output-into-one-growing-entry precedent | `src/shell-manager.ts:58-97` |
| PTY session ownership + exit handling (where the line buffer lives) | `src/pseudoterminal-manager.ts:10-99` |
| The three `pty.spawn()` call sites (only one should get capture) | `src/harness-manager.ts:70`, `src/ssh-manager.ts:36`, `src/pseudoterminal-manager.ts:51-59` |
| `harness.name === 'ssh'` discriminant (the codebase's existing pattern) | `web/src/MountedViewLayers.tsx:30`, `src/connection-manager.ts:17` |
| Harness tab body component (where the split UI goes) | `web/src/HarnessTab.tsx` |
| Generic transcript renderer + auto-scroll (reuse, don't rebuild) | `web/src/Transcript.tsx` |
| Resize-handle precedent | `web/src/ReportingSection.tsx:36-47` |
| `transcriptMaxLines` cap (already applied by `append()`, don't reimplement) | `src/config.ts:6,10` |

## Proposed changes

### 1. Server — PTY output capture

- In `PseudoterminalManager` (`src/pseudoterminal-manager.ts`):
  - Add `private harnessLineBuffers = new Map<string, string>()` alongside `private ptys` (`:11`), holding each harness PTY's incomplete trailing line.
  - Add a private method, e.g. `captureHarnessOutput(id: string, data: string): void`:
    - Look up the owning tab: `this.managers.tab.tabs.find((t) => t.harness?.ptyId === id)`. Return if none, or if it fails the gate `tab.view === 'harness' && tab.harness?.name !== 'ssh'` (decision 3/5).
    - Prepend any held partial buffer for `id` to `data`, split on `'\n'`; the last element (possibly `''`) is the new partial buffer for `id`, everything before it is the set of complete lines for this chunk.
    - If there is at least one complete line, call `this.managers.tab.append(tab.label, { input: '', output: completeLines.join('\n') })` — **one `LogEntry` per chunk, never per line** (decision 1). Do not hand-roll capping — `append()` already enforces `config.transcriptMaxLines` with FIFO eviction and emits the `entry:appended`/`state:dirty` events.
  - Call `captureHarnessOutput(session.id, data)` from the existing `onData` callback in `spawn()` (`:21-24`), after the existing `messageBus.emit('pty', ...)` call — do not replace or gate that emit, the terminal still needs the raw stream.
  - In `handleExit` (`:74-98`), before deleting from `this.ptys`: flush any remaining partial buffer for `id` as a final `append()` call (same gate as above), then `this.harnessLineBuffers.delete(id)`.
- `TabManager.view()` already runs `flattenBuffer(t.log, ...)` unconditionally for every tab (`src/tab-manager.ts:273`) — no change needed there; populating `tab.log` via `append()` is sufficient.

### 2. Web UI — split layout inside `HarnessTab.tsx`

- Modify `web/src/HarnessTab.tsx`:
  - Add an optional `bufferLines?: BufferLine[]` prop (optional, defaulting to `[]` when absent, so the existing calls in `HarnessTab.test.tsx` that omit it keep compiling and rendering unchanged).
  - Wrap the existing `.harness-body` div and a new `Transcript` (reused from `web/src/Transcript.tsx`, not a new component) in a vertical flex container, split 70/30 by default via `const [ratio, setRatio] = useState(0.7)`, clamped between 0.2 and 0.9 on drag.
  - Resize handle between them: copy the `onDividerDown` pattern from `ReportingSection.tsx:36-47` (`mousedown` → `mousemove`/`mouseup` listeners → clamp → `setRatio`), substituting `clientY` for vertical sizing.
  - Pass `Transcript` its required props: `lines={bufferLines}`, `client={client}` (already available in `HarnessTab`), `onToggleCollapse={() => {}}` and `onPromptClick={() => {}}` as no-ops (harness `LogEntry`s never set `input` or participate in collapsed tool-step groups, so these handlers are unreachable — `handleInputOutput`/`handleCollapsedToolSteps` in `tab-formatting-handlers.ts` never produce a `prompt` or `collapsed` line from harness output), and a local `scrollRef`.
  - If `bufferLines.length === 0`, render only `.harness-body` at full height — no split container, no resize handle, no empty `Transcript` (avoids showing `Transcript`'s "Type "help" for available commands." empty state, which doesn't apply here).
  - Styling: `.harness-split` container, `.harness-transcript` panel, `.harness-resize` handle in `web/src/theme.css`.
- Modify `web/src/MountedViewLayers.tsx` (`:22-32`): pass `bufferLines={t.bufferLines}` down to `<HarnessTab .../>` (`:28`). `TabView.bufferLines` is already populated once the capture wiring from decision 3 lands — no other change needed here.

### 3. Protocol — no changes needed

- `TabView` already carries `bufferLines[]`. When `Tab.log` is non-empty for a harness tab, `flattenBuffer()` produces entries, and `TabView.bufferLines` ships them over the wire. No protocol changes.
- `PtyDataEvent` continues to carry raw chunks for the terminal render. The transcript is a server-side aggregation, not duplicating the PTY data stream.

### 4. Transcript limitations for v1

- SSH harness tabs are excluded via the `tab.harness?.name !== 'ssh'` gate (decision 3/5) inside `PseudoterminalManager`, not a separate check elsewhere. Only named-harness tabs (claude, opencode, codex) capture transcripts.
- Transcript is view-only: no clickable links, no search, no copying (v1 scope). These are natural follow-ups.
- No transcript persistence — cleared on tab close. Revisit in v2 if needed.

### 5. Specs

- New `specs/harness-transcript.md`: capture model, split layout, resize handle, line buffering, auto-scroll, ephemerality, SSH exclusion.
- `specs/harness.md`: add a "Transcript" section referencing the new spec; note that harness tabs can now show a scrollable transcript panel.
- `specs/tabs.md`: note that harness tabs carry `bufferLines` when a transcript is active.

### 6. Tests (colocated, run via `./scripts/run.mjs check-diff`)

- `src/pseudoterminal-manager.test.ts` (existing file — add cases): PTY data chunk with multiple lines becomes one `LogEntry` (not one per line, regression test for the spacer landmine in decision 1); a chunk split mid-line across two `data` events joins correctly via `harnessLineBuffers`; capture is skipped for ssh tabs (`harness.name === 'ssh'`) and for inline PTYs (`openInlinePty`, no `harness` on the tab); `transcriptMaxLines` FIFO eviction applies (already covered generically by `append()`, but assert the harness path goes through it); exit flushes a trailing partial line.
- `web/src/HarnessTab.test.tsx` (existing file — add cases): with `bufferLines` omitted or `[]`, renders exactly as today (no split, no regression to the existing key-routing/exited-banner tests); with non-empty `bufferLines`, renders the split container and a `Transcript` with those lines; resize handle drag updates the ratio and clamps to [0.2, 0.9].
- `web/src/MountedViewLayers.test.tsx` (existing file — add a case): `bufferLines` from `TabView` is forwarded to `HarnessTab`.
- Manual/integration (see Verification below) rather than an automated end-to-end test — no existing harness spawns a real PTY in tests.

## Out of scope

- Clickable links, search, and copy affordances inside the harness transcript panel (view-only for v1).
- Transcript persistence across `--relaunch` or app restart.
- SSH harness tabs (`harness.name === 'ssh'`) — PTY-only, unchanged, per decision 5.
- Changing `transcriptMaxLines` semantics or default (`src/config.ts:6`) — the harness path reuses the existing entry-count cap as-is.

## Implementation order

1. Server-side PTY capture: `harnessLineBuffers`, `captureHarnessOutput`, wiring into `spawn()`'s `onData` and `handleExit`, in `PseudoterminalManager`; tests in `src/pseudoterminal-manager.test.ts`. This is usable/verifiable on its own once `HarnessTab.tsx` reads `tab.log` — check with `./scripts/run.mjs check-diff` before moving on.
2. Web UI: split layout in `HarnessTab.tsx`, resize handle, `bufferLines` prop threaded from `MountedViewLayers.tsx`; tests in `HarnessTab.test.tsx`.
3. Specs: new `specs/harness-transcript.md` + amendments to `specs/harness.md`, `specs/tabs.md`.
4. Public documentation.

Run `./scripts/run.mjs check-diff` after each step.

## Verification

- `./scripts/run.mjs check-diff` after each implementation step (per above).
- Manual: `harness claude` (or any configured harness) to open a harness tab, let it produce multi-line output (e.g. run a command that prints several lines at once inside the harness). Confirm the transcript panel appears below the terminal with no extra blank lines between consecutive output lines, drag the resize handle and confirm it clamps between 20% and 90%, close the tab and reopen a new harness tab and confirm the transcript starts empty (ephemeral). Separately, `ssh <destination>` and confirm no transcript panel appears for that tab.
