# Stream live output to a promoted full-tab terminal

**Complexity: 4/10** — root cause is a missing forwarding step in one module (`src/shell-promotion.ts`); the fix emits incremental PTY deltas after promotion and tracks one offset. No new architecture.

## Goal

A command promoted into a full-tab terminal — by the **open in terminal** action or `Ctrl+O` — freezes on the replayed snapshot and never updates again. Typing into it seems dead: keystrokes reach the process (the server routes them to the PTY), but the screen shows no response, so the user experiences the terminal as not accepting keyboard input. The terminal must instead keep streaming the program's output for the rest of the command.

## Background (verified)

- `src/shell-promotion.ts`'s `createShellPromotion` invokes `takeOver(learn)` exactly once, emitting the accumulated `latest` buffer (capped at `REPLAY_MAX_BYTES`) to the bus as a single `{ type: 'data', id, data: replay }` event, then marks itself `promoted` and ignores every later `observe()` call.
- `src/shell-manager.ts`'s `run()` hands every streamed chunk to `promotion.observe(buffer)` and stops updating the transcript entry once `promotion.isPromoted()` — so after promotion, chunks reach the promotion and die there. Nothing forwards ongoing output to `messageBus`.
- The shell PTY is registered through `PseudoterminalManager.spawnTransport`, whose handler callback is deliberately **not** published on the bus ("bytes are handed to handlers.onData instead of being published on the bus"), so no other path forwards its output either.
- Incoming keystrokes are fine end to end: `ptyInput` → `Controller.ptyInput` → `PseudoterminalManager.input` → the transport session's `write`. That's why the freeze reads to the user as dead input rather than a frozen screen.
- `messageBus.on('pty', ['data', 'exit'])` in `src/controller/events.js` forwards every bus PTY event to the client socket, and the client's `ShellTab` attaches `client.attachPty(ptyId, data => term.write(data))`. Wiring the deltas into the promotion module is sufficient — no client changes needed.
- `src/shell-manager.test.ts` already pins the takeover and the one-shot replay (`ptyEvents` contains the replay event) but has no assertion about post-promotion streaming — the gap this fix closes.

## Approach

Track an `emitted` offset inside the promotion. At takeover, mark the whole accumulated buffer as emitted after sending the replay. On every later `observe()` while promoted, emit the new suffix (`output.slice(emitted)`) as `{ type: 'data', id, data: delta }` and advance the offset. Manual and detected promotions share this path — `Ctrl+O` and auto-detection already funnel into the same `takeOver`, so fixing it once covers both directions of the issue.

## Implementation

1. **`src/shell-promotion.ts`** — add `let emitted = 0;` beside `latest`.
2. In `takeOver`, after computing `replay` and emitting it, set `emitted = latest.length;` — the replay is the whole buffer (or its bounded suffix); either way, everything pre-promotion is consumed, and the capped-replay offset arithmetic stays consistent.
3. In `observe`, when `promoted` is true, emit the incremental delta:
   ```ts
   observe: (output) => {
     latest = output;
     if (!promoted) {
       if (!detect) return;
       if (showsTerminalTakeover(output)) takeOver(true);
       return;
     }
     const delta = output.slice(emitted);
     if (delta) {
       emitted = output.length;
       const ptyId = ptyIdOf();
       if (ptyId) messageBus.emit('pty', { type: 'data', id: ptyId, data: delta });
     }
   },
   ```
   Detection (`detect`, `learn`) stays untouched; only the post-promotion branch is new.

## Tests

Add to `src/shell-manager.test.ts`, in the existing `ShellManager — promotion to a terminal` block (whose setup already subscribes to `messageBus` PTY data events and streams chunks through `streamOutput`):

- **detected**: after the takeover triggers, further chunks arrive on the bus as individual deltas in order; no chunk re-emits previously-replayed content.
- **manual (`promoteRunning`)**: same delta behavior when the user forces the terminal with no detection signal.
- **quiet before promotion**: no PTY data events between a chunk that does not announce itself and the moment of manual promotion.

## Verification

`./scripts/run.mjs check-diff` — lint, typecheck, and the diff-scoped server tests.

## Out of scope

- No client-side changes: the existing `pty` wire channel and `ShellTab` attachment already render deltas.
- No changes to the replay cap (`REPLAY_MAX_BYTES`) or to detection evidence patterns (`interactive-signals.ts`).
- The separate inline-PTY path (`openInlinePty`, `shell --pty`, the interactive name list) already streams via `spawn()`'s bus-published `onData` — untouched.
