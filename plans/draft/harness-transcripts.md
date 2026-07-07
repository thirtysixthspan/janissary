# Harness Tab Transcripts

## Summary

Give harness tabs a transcript that records harness output. When a harness (claude, opencode, codex, or an SSH session) is running, its stdout/stderr is captured into a `LogEntry[]` buffer identical in structure to agent transcripts. The transcript is rendered in a scrollable panel below the PTY view, with the PTY and transcript split vertically via a resize handle. The transcript is ephemeral (memory-only, not persisted) and cleared when the harness tab closes.

## Decisions (to be confirmed with user)

1. **Transcript model: append-only log, same structure as agent transcripts.** Harness transcripts use the same `LogEntry[]` type as agent tabs. Each line of PTY output becomes a `LogEntry` with `input: ''` (no user command) and `output: <line>`. This reuses the existing `flattenBuffer()` / `BufferLine[]` pipeline without any new types.
2. **Layout: split view, PTY above, transcript below.** The harness tab body becomes a vertical split: the terminal occupies the top portion (default 70%), the transcript scrollable area occupies the bottom (30%). A draggable resize handle separates them, following the `ReportingSection` resize-handle precedent. The handle defaults to the bottom position; the user can drag it up to see more transcript.
3. **Capture: line-by-line, with buffering.** PTY output is captured line-by-line, appending to the tab's `log` array. This is identical to how `controller.ts` appends output lines to agent transcripts. The transcript panel auto-scrolls to the bottom on new output, same as agent transcripts.
4. **Ephemeral storage.** Harness transcripts are not persisted to disk. When the harness tab closes (PTY exits), the transcript is gone. This matches the existing harness lifecycle (fire-and-forget, no `--relaunch`).
5. **No transcript during SSH sessions (v1).** v1 applies to named harnesses (claude, opencode, codex). SSH harness tabs (`view: 'harness'` with `destination`) keep their current behavior (PTY-only, no transcript). This can be extended in v2.

## Verified codebase facts that shape the design

- **Transcript rendering is already generic.** `Transcript.tsx` and `TranscriptLine.tsx` render `BufferLine[]` from `TabView.bufferLines`. Adding a `bufferLines` field to harness tabs would render with zero new client code — the existing components handle it.
- **PTY data already flows through the server.** `PseudoterminalManager` emits `data` events that are forwarded to the client as `PtyDataEvent` chunks. The server can buffer these into `LogEntry[]` by accumulating lines.
- **Harness tabs currently have no `log` field.** `HarnessView` (`src/types.ts`) carries `{ name, program, ptyId, status, exitCode?, destination? }`. The `Tab` type carries the `log` field. Adding a transcript to harness tabs means the server populates `tab.log` from PTY output, and the protocol transmits `bufferLines` for harness tabs.
- **`flattenBuffer` is already called for every tab.** `TabManager.view()` calls `flattenBuffer()` on the log to produce bufferLines. Harness tabs currently skip this (they have no log). Adding entries to `tab.log` would automatically produce `bufferLines` without changes to the view pipeline.
- **The `--workspace` flag on harnesses implies a running build/test process.** Captured transcript data lets the user scroll back through output without switching to a separate log file — it makes the harness tab self-contained.
- **Resize handles have a well-established pattern.** `ReportingSection.tsx` demonstrates vertical resize with mouse drag (`onDividerDown` pattern: `mousedown` → add `mousemove`/`mouseup` listeners → clamp → store in `useState`). The harness transcript split would copy this pattern, swapping `clientY` for vertical sizing.
- **Line buffering is standard.** Node.js PTY output arrives in chunks, not lines. The server splits chunks on `\n`, appending each line as a `LogEntry`. Incomplete final lines are held in a line buffer and flushed when the next `\n` arrives.

## Proposed changes

### 1. Server — PTY output capture

- In `PseudoterminalManager` or a new `HarnessTranscript` module:
  - When a harness PTY is created, the manager installs a `data` listener that buffers output into `tab.log[]`.
  - Line splitting: `splitOnNewlines(chunk, partialLineBuffer)` → array of complete lines + new partial buffer.
  - Each complete line becomes: `{ input: '', output: line, timestamp: Date.now() }` `LogEntry`.
  - Capped at `config.transcriptMaxLines` (same limit as agent transcripts), enforced with FIFO eviction.
- `TabManager.view()` already runs `flattenBuffer(tab.log, tab.toolStepsExpanded)` for agent tabs. For harness tabs, the same call is made (no change needed — just ensure the log is populated).

### 2. Web UI — split layout

- New component `web/src/HarnessTranscriptPanel.tsx`:
  - Props: `bufferLines: BufferLine[]`, `scrollRef: RefObject<HTMLDivElement>`.
  - Renders a scrollable transcript area using the same `TranscriptLine` components as agent tabs.
  - Auto-scroll: scrolls to bottom on new lines (same `useEffect` on `bufferLines.length` change).
- Modify `ShellTabLayer.tsx` or `MountedViewLayers.tsx`:
  - When rendering a harness tab (`view: 'harness'`), wrap the xterm container and `HarnessTranscriptPanel` in a vertical flex container.
  - Add a resize handle between them, using the `ReportingSection.onDividerDown` pattern.
  - Resize state: `const [ratio, setRatio] = useState(0.7)` — 70% terminal, 30% transcript. Clamped between 0.2 and 0.9.
  - If `bufferLines.length === 0`, hide the transcript panel entirely (the split bar is not rendered).
  - Styling: `.harness-split` container, `.harness-transcript` panel, `.harness-resize` handle in `theme.css`.

### 3. Protocol — no changes needed

- `TabView` already carries `bufferLines[]`. When `Tab.log` is non-empty for a harness tab, `flattenBuffer()` produces entries, and `TabView.bufferLines` ships them over the wire. No protocol changes.
- `PtyDataEvent` continues to carry raw chunks for the terminal render. The transcript is a server-side aggregation, not duplicating the PTY data stream.

### 4. Transcript limitations for v1

- SSH harness tabs are excluded (the `HarnessView.destination` field distinguishes them). Only named-harness tabs (claude, opencode, codex) capture transcripts.
- Transcript is view-only: no clickable links, no search, no copying (v1 scope). These are natural follow-ups.
- No transcript persistence — cleared on tab close. Revisit in v2 if needed.

### 5. Specs

- New `specs/harness-transcript.md`: capture model, split layout, resize handle, line buffering, auto-scroll, ephemerality, SSH exclusion.
- `specs/harness.md`: add a "Transcript" section referencing the new spec; note that harness tabs can now show a scrollable transcript panel.
- `specs/tabs.md`: note that harness tabs carry `bufferLines` when a transcript is active.

### 6. Tests (colocated, run via `./scripts/run.mjs check-diff`)

- `src/pseudoterminal-manager.test.ts`: PTY data captured into `tab.log[]` when harness tab is active, line splitting, transcript cap enforcement.
- `web/src/HarnessTranscriptPanel.test.tsx`: renders transcript lines from bufferLines, auto-scrolls, hidden when empty.
- `web/src/ShellTabLayer.test.tsx`: split layout renders when transcript is non-empty, resize handle drags correctly, clamps to min/max.
- Integration test: spawn a harness tab, send a command, verify transcript panel appears with captured output, verify terminology rendering doesn't break.

## Implementation order

1. Server-side PTY capture: line buffering into `tab.log[]` in `PseudoterminalManager`, tests.
2. Web UI: `HarnessTranscriptPanel` component, split layout in `ShellTabLayer`, resize handle, tests.
3. SSH exclusion: gate capture on `!tab.harness?.destination`.
4. Specs: new `harness-transcript.md` + amendments to harness, tabs.
5. Public documentation.

Run `./scripts/run.mjs check-diff` after each step.
