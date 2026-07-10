# Harness PTY session recording

**Complexity: 4/10** — the recording half is a single well-precedented server-side observer (a recorder that mirrors `HarnessScreenReader`'s bus-subscription + `HarnessManager`-owned lifecycle exactly), writing an append-only file (mirroring `TranscriptLogger`'s streaming-append style and `harness-capture-file`'s directory/init/clear structure). The monitor-availability half adds a cross-subsystem integration — feeding harness output into the existing monitor buffer/flush pipeline — which is what lifts the number from 3 to 4: it touches `MonitorManager` (already at 194/200 counted lines, so an extraction is forced), adds a small feed helper, and a public accessor on `HarnessManager`. Still no client, protocol, or UI changes. The real correctness care: the write-stream error handling, the lazy-create-on-first-output behavior, and de-duplicating repeated screen captures so an idle harness doesn't re-prompt every monitor cycle.

## What this plan is (and is not)

This plan persists the **raw PTY byte stream** of a harness session to a replayable file on disk, with **no UI**. It is deliberately *not* the other conceivable "harness transcript" feature — a live, scrollable transcript *panel* rendered inside the harness tab (batching output into `LogEntry[]` for on-screen display). That panel is a separate, UI-heavy concern; a prior `harness-transcripts.md` draft covering it existed but has since been removed from `plans/`. If it is revived, the two features are complementary and share no code beyond both amending `specs/harness.md`.

## Summary

Record every harness session's PTY stream to a replayable [asciicast v2](https://docs.asciinema.org/manual/asciicast/v2/) file under `.janissary/recordings/`. Recording is automatic (no command) and covers named-harness tabs (claude, opencode, codex) — the same scope that already gets a `HarnessScreenReader`. A new per-PTY `HarnessRecorder`, owned by `HarnessManager` alongside the screen readers, subscribes to the existing `pty` message-bus channel and appends one asciicast event line per PTY `data` and `resize` event, closing the file when the PTY exits. This directly fixes the limitation `specs/harness.md` already calls out — *"the harness's own scrollback is gone once its tab closes"* — by preserving the full timed session, ANSI and all, in a file that plays back with `asciinema play` or any asciicast web player. There is no in-app retrieval; files accumulate under `.janissary/recordings/` and are opened externally.

The plan additionally **makes the recorded harness output available to AI monitors** (`monitor <persona> <harness-tab>`). Harness tabs have no `LogEntry` transcript, which is exactly why `plans/complete/monitoring-ai.md:538` and `monitor-transcript-access.md:45` put them out of scope for monitoring. Now that the harness's output is captured, a monitor targeting a harness tab is fed that output — as readable rendered-screen text (see decision 7) — through the monitor's existing 30-second buffer/flush pipeline, with no change to how suggestions are produced or delivered.

## Decisions (confirmed with user)

1. **Format: asciicast v2.** Line 1 is a JSON header — `version` 2, `width`/`height` (the spawn dimensions), `timestamp` (start time as integer Unix epoch seconds), `command` (the harness program name), `title` (the tab label), and `env` carrying `TERM: "xterm-256color"` to match the PTY's own terminal name (`src/pty.ts:42`). Every subsequent line is a JSON event array `[<elapsed-seconds-float>, "<code>", "<data>"]` where `code` is `"o"` for output (PTY `data`) and `"r"` for a resize (`data` = `"<cols>x<rows>"`). `data` strings are JSON-escaped by `JSON.stringify`, which correctly encodes the control/ANSI bytes asciicast expects (e.g. ESC → ``). Chosen over a raw byte log (loses timing + resize) and a flattened-text transcript (loses ANSI + timing, and is what the *other* draft plan effectively produces on-screen).
2. **Trigger: automatic, every session.** Every named-harness tab records from spawn to exit with no command. This is the whole point — it makes the otherwise-lost scrollback recoverable after the tab closes.
3. **Retrieval: none in scope — files just accumulate.** No `harness recording …` command, no editor-tab opener. Recordings live under `.janissary/recordings/` and the user replays them outside the app. (A future opener/reveal command is a natural follow-up; explicitly out of scope here.)
4. **Scope = the `HarnessManager.spawnTab` path only** (claude/opencode/codex), matching where `HarnessScreenReader`s are created today. SSH tabs (`SshManager`, `harness.name === 'ssh'`) and inline PTYs / full-tab takeovers (`PseudoterminalManager.openInlinePty`) are **not** recorded — they never get a screen reader either, so this keeps the two observers symmetric and needs no new gate. (Recording the raw stream centrally in `PseudoterminalManager.spawn` would catch those too; deliberately not doing that.)
5. **Lazy file creation on first output.** The `.cast` file (and its header) is written only when the first `data` event arrives. A harness that exits instantly — e.g. the binary-not-found case `specs/harness.md` describes, where the PTY exits immediately and the tab closes — leaves no empty file behind. A `resize` arriving before any output just updates the pending header dimensions; it does not create the file.
6. **Lifetime: cleared at a fresh launch, preserved across `--relaunch`.** Follows the exact rule already used for `.janissary/captures/` (`clearCaptureDirectory()` runs only when `!args.relaunch`, `src/main.ts:140`), so a run's recordings are bounded to that run and a `--relaunch` handoff keeps them. **Flagged for the reviewer:** if a permanent cross-run archive is wanted instead, simply omit the `clearHarnessRecordingDirectory()` call from the cleanup line — nothing else changes.
7. **Monitor feed = rendered-screen text, not raw `.cast` bytes.** A monitor watching a harness tab receives that tab's latest **rendered screen** (the de-ANSI'd, trailing-blank-trimmed text `HarnessScreenReader.latestCapture()` already produces, `src/harness-screen.ts`), delivered as `LogEntry`s (`input: ''`, `output: <screen text>`) tagged with the harness tab's label. Decision, and the rationale: the three named harnesses are full-screen TUIs that repaint via cursor-positioning escapes, so the raw PTY/`.cast` byte stream does **not** linearize into readable text — concatenating and stripping ANSI yields overlapping garbage an LLM can't reason over. The rendered screen is the only coherent text form, and the screen reader (the recorder's sibling observer of the same bytes) already computes it, so the feed reuses it rather than re-parsing the file. The `.cast` recording remains the durable/replay projection of the same output stream; the monitor consumes the rendered projection. Consequence: monitors see periodic **screen snapshots** (the latest screen as of each flush), not full linear scrollback — which matches the capture cadence (a fresh capture ~1s after each output burst; an idle screen is not re-captured). Rejected alternative: rendering the `.cast` file through a second headless terminal — it would rebuild exactly what the live `HarnessScreenReader` already holds.

## Verified codebase facts that shape the design

- **Every PTY byte already flows through one bus channel.** `PseudoterminalManager.spawn`'s `onData` emits `{ type: 'data', id, data }` on the `pty` channel (`src/pseudoterminal-manager.ts:22`); `resizeOne` emits `{ type: 'resize', id, cols, rows }` (`:38`); exit emits `{ type: 'exit', id, exitCode }` (`:105`). `HarnessScreenReader` already subscribes to exactly these three, with an array `messageBus.on('pty', ['data', 'exit', 'resize'], …)` and a `switch`-like discrimination on `event.type` (`src/harness-screen.ts:32-36`). The recorder subscribes and discriminates the same way — no new events, no change to the emit path.
- **The `"r"` (resize) event genuinely fires during a session.** The client's terminal-resize RPC `ptyResize` reaches `Controller.ptyResize` → `this.managers.pty.resizeOne(id, cols, rows)` (`src/controller.ts:128`), which emits the per-id `resize` bus event (`src/pseudoterminal-manager.ts:38`). So recording `"r"` events is not dead code — resizing the browser terminal over a live harness produces them.
- **`HarnessScreenReader` is the precise template for lifecycle.** It is constructed in `HarnessManager.spawnTab` (`src/harness-manager.ts:98`) with `(id, dims.cols, dims.rows)` where `dims = this.managers.pty.spawnDimensions()` (`:97`), tracked in `private screenReaders = new Map<string, HarnessScreenReader>()` (`:15`), and disposed + removed in the `pty`/`exit` listener registered in the `HarnessManager` constructor (`:18-22`). The recorder is a second map created and disposed at the identical points.
- **`data`/`resize` carry strings, not raw bytes.** `PtyEvent.data: string` (`src/bus.ts:87`). node-pty decodes PTY output to UTF-8 strings before it reaches the bus, so the recording captures the same string fidelity the screen reader and client terminal already see (a multibyte sequence split across chunks is a pre-existing property of the pipeline, not introduced here). asciicast `data` is a JSON string, so this is a natural fit.
- **Append-only streaming persistence has a precedent.** `TranscriptLogger.append` opens the day's log and `appendFileSync`s one JSON line per entry (`src/transcript/logger.ts:15-19`). The recorder is the same shape but keeps a single `fs.createWriteStream(path, { flags: 'a' })` open for the session (non-blocking `.write()` per event, so a burst of harness output never blocks the synchronous `bus.emit` and its other listeners — notably the client-forward and the screen reader), closed on exit.
- **The capture-file module is the template for the directory helpers.** `harness-capture-file.ts` gives `initHarnessCaptureDirectory(projectDir)` → `<projectDir>/.janissary/captures` (`:6-8`), `writeCaptureFile` with label sanitization `replaceAll(/[^\w-]/g, '-')` and an ISO timestamp `replaceAll(/[:.]/g, '-')` (`:17-24`), and `clearCaptureDirectory()` (`:26-29`). The recording-file module mirrors all three for `.janissary/recordings` and `.cast`.
- **Init + clear wiring has one obvious home.** `src/main.ts:131` calls `initHarnessCaptureDirectory(cwd)`; `:140` runs `clearCaptureDirectory()` inside `if (!args.relaunch) { … }`. The recording equivalents slot in beside each.
- **`bus.emit` already isolates listener throws** (`src/bus.ts:60-71`), so a recorder exception can't break output delivery. But a Node stream's asynchronous `'error'` event is **not** caught by that try/catch and would crash the process if unhandled — the recorder must attach an `'error'` listener that disables itself. This is the one non-obvious correctness point.
- **Test patterns exist to copy.** `src/harness-screen.test.ts` drives the recorder-shaped bus flow with `vi.useFakeTimers()` + `vi.advanceTimersByTimeAsync` and `messageBus.emit('pty', …)` (`:6,13,19-24,71`); `src/harness-capture-file.test.ts` unit-tests the directory helpers with `vi.mock('node:fs')` (`:10`). Fake timers make asciicast elapsed-time assertions deterministic.

Monitor-integration facts:
- **Monitors can already *target* a harness tab; they just receive nothing.** `validateTargets` and `matchesTargets` reject only `view === 'monitor'` tabs (`src/monitor-targets.ts:9,18,26`), so a harness-view tab is a valid target today. The gap is purely *sourcing content*: `MonitorManager.start` seeds the buffer by iterating each target tab's `t.log` (`src/monitor-manager.ts:71-78`) — empty for harness tabs — and the live channel is a `messageBus.on('transcript', 'entry:appended', …)` subscription (`:101-106`), which harness tabs never emit because they bypass `TabManager.append`. So both of a monitor's input channels are silent for a harness target.
- **The monitor buffer/flush pipeline is content-source-agnostic.** Entries are `{ tabLabel, entry: LogEntry }` in `reg.buffer` (`src/monitor-manager.ts:24`), flushed every 30s and formatted as `[${tabLabel}]\n${entry.input}\n${entry.output}` (`:125-127`). Anything pushed into `reg.buffer` tagged with a target's label flows through prompt → `parseSuggestion` → `deliver` unchanged — so feeding harness output is purely a matter of populating the buffer, no pipeline changes.
- **`MonitorManager` already holds `managers`,** so it can reach `managers.harness` (`src/managers.ts:27,38`). The screen-capture lookup to expose is the one `HarnessManager.capture` already performs: find the tab by label, then `this.screenReaders.get(tab.harness.ptyId)?.latestCapture()` (`src/harness-manager.ts:38,41`) — a public accessor wraps exactly that.
- **`MonitorManager` is at 194/200 counted lines** (`grep -vE '^\s*//' | grep -vE '^\s*$' | wc -l`). New logic cannot live there without extraction — see §10.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| The `pty` channel `data`/`resize`/`exit` events to subscribe to | `src/bus.ts:86-89`, emitted at `src/pseudoterminal-manager.ts:22,38,105` |
| Per-PTY resize RPC path (proves `"r"` events fire) | `src/controller.ts:128` → `src/pseudoterminal-manager.ts:38` |
| `HarnessScreenReader` — the observer whose lifecycle/shape to mirror (subscription `:32-36`, dispose `:43-49`) | `src/harness-screen.ts` |
| `ensureCaptureDirectory` — the recursive-mkdir helper to mirror | `src/harness-capture-file.ts:10-12` |
| Reader-map create site + spawn dimensions | `src/harness-manager.ts:97-98` |
| Reader-map dispose-on-exit listener | `src/harness-manager.ts:18-22` |
| Streaming append-only persistence precedent | `src/transcript/logger.ts:15-19` |
| Directory init / filename sanitization / clear template | `src/harness-capture-file.ts` |
| `init…`/`clear…` wiring points (with `--relaunch` guard) | `src/main.ts:131,140` |
| Listener-throw isolation (but NOT stream `'error'`) | `src/bus.ts:60-71` |
| Fake-timer + `emit('pty', …)` test pattern | `src/harness-screen.test.ts` |
| `node:fs`-mocked directory-helper test pattern | `src/harness-capture-file.test.ts` |
| Rendered-screen text to feed monitors (`latestCapture()`) | `src/harness-screen.ts` |
| Screen-reader-by-tab-label lookup to wrap in a public accessor | `src/harness-manager.ts:38,41` |
| Monitor buffer/flush pipeline (push `{tabLabel, entry}`, rest is free) | `src/monitor-manager.ts:24,71-78,120-142` |
| Harness tabs are already valid monitor targets (only `monitor` view excluded) | `src/monitor-targets.ts:9,18,26` |
| Target helpers module (where an extracted seed helper belongs) | `src/monitor-targets.ts` |

## Proposed changes

### 1. New module — `src/harness-recording-file.ts`

Mirror `harness-capture-file.ts` one-to-one (init, ensure, path-builder, clear — the same four-function shape, so review it side by side):
- A module-level `recordingDirectory` string, empty until initialized.
- `initHarnessRecordingDirectory(projectDirectory)` — sets `recordingDirectory` to the project's `.janissary/recordings` (mirrors `initHarnessCaptureDirectory`, `src/harness-capture-file.ts:6-8`).
- `ensureRecordingDirectory()` — creates that directory recursively (mirrors `ensureCaptureDirectory`, `:10-12`). The recorder calls this once before opening its stream; the path builder itself does no I/O.
- `harnessRecordingPath(label, startedAt)` — returns the absolute `.cast` path, reusing the exact label sanitization and ISO-timestamp scheme of `writeCaptureFile` (`:17-24`): sanitize the label by replacing every non-`[\w-]` character with `-`, and format `startedAt` as an ISO string with `:` and `.` replaced by `-`, giving `<safeLabel>-<timestamp>.cast`.
- `clearHarnessRecordingDirectory()` — best-effort recursive/forced removal wrapped in try/catch, identical to `clearCaptureDirectory` (`:26-29`).

Because this reuses `writeCaptureFile`'s computed-path pattern verbatim, its `fs` calls clear the `security/detect-non-literal-fs-filename` lint the same way the capture module and `TranscriptLogger` already do — neither carries an `eslint-disable`, confirmed — so the recorder needs none either.

### 2. New module — `src/harness-recorder.ts`

`HarnessRecorder` — one instance per harness PTY, self-contained; model its structure on `HarnessScreenReader` (`src/harness-screen.ts`), which is the same shape (bus subscription in the constructor, per-event private handlers, idempotent `dispose`). The constructor takes the PTY id, the tab label, the harness program name, and the spawn dimensions (cols/rows). It records the start time once (used for both the header timestamp and every event's elapsed time), holds the latest known dimensions, and keeps an optional write stream plus `disposed`/`failed` flags.

Behavior contract (describe, don't implement):
- **Subscription.** In the constructor, subscribe once to the `pty` channel for `data`, `exit`, and `resize`, ignoring events whose `id` isn't this recorder's, and discriminate on `event.type` exactly as `HarnessScreenReader` does at `src/harness-screen.ts:32-36`: `data` → record output, `resize` → record/track a resize, `exit` → dispose.
- **Lazy open (decision 5).** The stream is opened, and the asciicast header line written, only on the first `data` event — never at construction. Opening calls `ensureRecordingDirectory()`, then opens an append-mode write stream at `harnessRecordingPath(label, startedAt)`. Use a single long-lived append stream (not a per-event `appendFileSync`) so a burst of harness output never blocks the synchronous `bus.emit` and its other listeners — this is the one deliberate divergence from `TranscriptLogger`'s per-line `appendFileSync` (`src/transcript/logger.ts:15-19`), justified by PTY output volume.
- **Header.** The first line is the asciicast v2 header object with: `version` 2; `width`/`height` from the latest known dimensions at open time; `timestamp` as integer Unix epoch **seconds** for the start time; `command` set to the harness program name (the bare binary, e.g. `claude` — decision: not the `--model`-flagged command, which isn't held as a local in `spawnTab`); `title` set to the tab label; and `env` carrying `TERM: "xterm-256color"` to match the name the PTY is actually spawned with (`src/pty.ts:42`), which players read for correct rendering. Serialize with `JSON.stringify` and terminate with a newline.
- **Output events.** Each `data` event appends one asciicast event line: the array `[<elapsed-seconds>, "o", <chunk-string>]`, `JSON.stringify`-serialized (which correctly escapes the ESC/control bytes) and newline-terminated. No batching or line-splitting — one asciicast event per PTY chunk, verbatim.
- **Resize events.** A `resize` updates the recorder's latest-known dimensions. If the stream is already open, it also appends `[<elapsed-seconds>, "r", "<cols>x<rows>"]`. A resize arriving *before* the first output only updates the pending header dimensions and does **not** open the file (decision 5).
- **Elapsed time.** Seconds since the recorded start time as a floating-point value, rounded to a fixed sub-second precision (microseconds) so lines stay compact; values are non-decreasing because they derive from one monotonic start.
- **Error handling.** Attach a stream `'error'` listener that sets `failed` and stops further writes (the one async failure the bus's per-listener try/catch cannot catch — see the bus fact above). All write paths no-op when `disposed` or `failed`. File-system best-effort, matching the rest of the persistence code.
- **Dispose.** Idempotent (guard on a `disposed` flag), unsubscribe from the bus, and end the stream if open. Mirrors `HarnessScreenReader.dispose` (`src/harness-screen.ts:43-49`).

Import `fs` primitives from `node:fs` and the helpers from `./harness-recording-file.js` (the `.js` extension is the `src/` NodeNext rule). Expected size well under the 200-line limit (~90 lines).

### 3. `src/harness-manager.ts` — own the recorder lifecycle alongside the screen reader

Everything here parallels the existing `screenReaders` map, so make each change adjacent to its screen-reader counterpart:
- Add a second private map, `recorders`, keyed by PTY id, beside `private screenReaders` (`:15`).
- In the constructor's `pty`/`exit` listener, mirror the two screen-reader cleanup lines (`:20-21`) for the recorders map — dispose the recorder for the exiting id and delete it.
- In `spawnTab`, immediately after the screen reader is constructed (`:98`), construct a `HarnessRecorder` and store it in the recorders map. The four values it needs are all in scope there: `id` (`:96`), the `label` parameter of `spawnTab`, `program` (`:89`, `HARNESS_COMMANDS[name]`), and `dims` (`:97`).

No other call site changes: SSH and inline PTYs go through different spawn paths (`SshManager.…spawn`, `src/ssh-manager.ts:36`; `PseudoterminalManager.openInlinePty`, `src/pseudoterminal-manager.ts:60`) and are intentionally excluded (decision 4) — neither gets a screen reader today either, so the two observers stay symmetric.

Both new lines of imports/fields keep the file (currently 114 lines, `wc -l`) far under the 200-line `max-lines` limit; `src/main.ts` (§4) is at 172 lines and its two added lines likewise stay under.

### 4. `src/main.ts` — init and clear

- Beside `initHarnessCaptureDirectory(cwd)` (`:131`): add `initHarnessRecordingDirectory(cwd)`.
- Inside the `if (!args.relaunch) { … }` cleanup (`:140`): add `clearHarnessRecordingDirectory()` alongside `clearCaptureDirectory()`.
- Add the import from `./harness-recording-file.js`.

### 5. Protocol / client — no changes

Both halves are server-side. The recording is a pure side effect on an existing bus subscription. The monitor feed reuses the existing `monitor <persona> [target…]` command and the existing suggestion delivery; nothing new crosses the wire. No `protocol.ts`, no `web/`, no `TabView`, no new client message.

### 6. `src/harness-manager.ts` — expose the latest screen text

Add one public method (e.g. `latestScreenText(label)`) that returns the named harness tab's most recent rendered screen capture — `{ text, capturedAt }` or `undefined`. It performs the exact lookup `capture()` already does (`src/harness-manager.ts:38,41`): find the tab by label, guard that it is a harness tab with a `HarnessScreenReader`, and return that reader's `latestCapture()`. This is the only new public surface on `HarnessManager`; it exposes the reader's rendered text (decision 7) without exposing the private `screenReaders` map. (`capture()` could be refactored to call it, but that is optional and not required by this plan.)

### 7. New module — `src/monitor-harness-feed.ts`

A small helper that turns harness targets into monitor buffer entries, kept out of `MonitorManager` because that file is at 194/200 counted lines (see the monitor facts above). One exported function — given `managers`, a monitor's resolved `targets`, and the monitor's per-target "last seen capture time" map — returns the new `{ tabLabel, entry }[]` to append: for each **harness-view** target tab, call `managers.harness.latestScreenText(label)` (§6); if a capture exists and its `capturedAt` is newer than the map's stored value for that label, emit one `LogEntry` (`input: ''`, `output: <screen text>`) tagged with the tab label and update the map. Non-harness targets are ignored here (they already flow through `t.log`/`entry:appended`). The dedupe-by-`capturedAt` is what stops an idle harness — whose screen reader keeps returning the same capture — from re-prompting the monitor every 30s (see the complexity note). Group targets resolve to their current member tabs the same way the existing seed loop does (`src/monitor-manager.ts:71-74`); reuse that resolution rather than re-deriving it — factor it so both callers share it.

### 8. `src/monitor-manager.ts` — feed harness output into the buffer

Three minimal edits; because the file is at the 200-line limit, **first extract the existing initial-seed target loop** (`:71-78`) into a helper (in `src/monitor-targets.ts`, where target logic lives, or the new feed module) and call it from `start()`. That extraction frees counted lines and is where the new seed call also goes, so the net change to `monitor-manager.ts` stays within budget — verify with `./scripts/run.mjs lint-files` after editing.
- **`MonitorSub` type:** add a per-target `harnessSeen` map (tab label → last-fed `capturedAt`), initialized empty in the `reg` literal (`:66`).
- **Seed (`start`):** after the existing per-target `t.log` seeding (now extracted), also push the harness-feed helper's entries (§7) into `reg.buffer`, so a monitor started mid-session immediately gets each harness target's current screen.
- **Flush (`flush`):** the guard at `:122` currently early-returns on `!reg || reg.inFlight || reg.buffer.length === 0`. Split it: return immediately only on `!reg || reg.inFlight`; then top up `reg.buffer` with the harness-feed helper's entries (this is the live channel, since harness tabs never emit `entry:appended`); then return if the buffer is still empty. This keeps the "no new content → no ACP prompt" guarantee intact — an idle harness produces no new capture, the helper returns nothing, and the flush still no-ops.

No change to `subscribe`, `deliver`, `ask`, `rate`, or teardown: harness entries ride the same buffer and formatting as agent entries. Stopping/owner-close cleanup is unchanged (the `harnessSeen` map is dropped with the `MonitorSub`).

### 9. Specs

- **New `specs/harness-recording.md`:** the asciicast v2 shape (header + `o`/`r` event lines), automatic scope (named harnesses only; ssh/inline excluded and why), lazy creation on first output, `.janissary/recordings/<label>-<timestamp>.cast` naming and sanitization, resize capture, lifecycle (opens on first output, closes on PTY exit), clear-on-fresh-launch / preserve-on-`--relaunch`, and the explicit no-retrieval-command decision. Note replay via `asciinema play <file>`.
- **Amend `specs/harness.md`:** add a "Session recording" subsection near "Screen capture" (§ line 131), drawing the distinction — *screen capture* = a point-in-time snapshot of the visible screen written on demand; *recording* = the full timed stream written automatically for the whole session. Update the Lifecycle sentence *"the harness's own scrollback is gone once its tab closes"* (`:129`) to add that the full session is preserved in its recording file. Add a sentence that a harness tab can now be a monitor target, fed its rendered screen. Cross-link `[[harness-recording]]` and `[[monitoring]]`.
- **Amend `specs/monitoring.md`:** in "Transcript access" (`:9-11`), note that a harness-view target has no `LogEntry` transcript, so it instead contributes its latest **rendered screen** — seeded at monitor start and refreshed on each 30-second flush when the screen has changed since the last one fed (deduped by capture time); an idle harness contributes nothing. This lifts the "only agent tabs" limitation recorded in `plans/complete/monitoring-ai.md:538`. Note SSH harness tabs remain unwatchable (no screen reader — same exclusion as recording, decision 4).

### 10. Public documentation

- `public-documentation/advanced-agents/harness.md`: a short "Recordings" section — where files land, that recording is automatic, and how to replay (`asciinema play .janissary/recordings/<file>.cast`, or drop into a web player). No screenshot needed (no UI surface). Add a line that a harness tab can be watched by a monitor (`monitor <persona> <harness-label>`), which reads the harness's on-screen output.

## Out of scope

- Any retrieval/opener/reveal command or editor tab for recordings (decision 3).
- Recording SSH tabs or inline/takeover PTYs (decision 4) — different spawn paths, no screen reader either.
- The in-app scrollable transcript panel (a separate, UI-side concern — see "What this plan is (and is not)"); this plan writes files only.
- Compression, rotation, or size caps on `.cast` files (a run's recordings are already bounded by the fresh-launch clear; revisit if sessions get huge).
- Capturing keystroke **input** (`"i"` events) — output + resize only for v1; input recording is a privacy-sensitive follow-up.
- Persisting recordings across a fresh (non-`--relaunch`) launch — flagged as a one-line toggle in decision 6, but defaulting to the capture-consistent clear.
- Feeding monitors the **full linear scrollback** of a harness (from the `.cast` file); the monitor feed is periodic rendered-screen snapshots (decision 7).
- Monitoring **SSH** harness tabs — they have no screen reader, so there is nothing to feed (same exclusion as recording, decision 4).
- Any new monitor command, RPC, or UI for the harness feed — it reuses the existing `monitor <persona> <target>` surface end to end.

## Implementation order

1. `src/harness-recording-file.ts` + `src/harness-recording-file.test.ts` (directory init/path/clear, `node:fs`-mocked, copying `harness-capture-file.test.ts`). Self-contained; verify with `./scripts/run.mjs check-diff`.
2. `src/harness-recorder.ts` + `src/harness-recorder.test.ts`. Drive it exactly like `harness-screen.test.ts` — `vi.useFakeTimers()` and `messageBus.emit('pty', …)` to feed events — but because the recorder writes real files, **do not mock `node:fs`**; instead point `initHarnessRecordingDirectory` at a fresh real temp directory created per test (`fs.mkdtempSync` under `os.tmpdir()`, removed in `afterEach`), then read the `.cast` back and assert its lines. Decision, and the one gotcha: the append stream flushes asynchronously, so a test must end the stream (emit `exit`, or call `dispose`) and await its close before reading the file — assert on the file only after the stream has finished, not immediately after the last `emit`. Cases: header written on first `data` with the spawn width/height, integer-seconds `timestamp`, `command`, `title`, and `env.TERM`; **no file created** when only a `resize` (or nothing) arrives before dispose; `data` chunks become `["o"]` lines with non-decreasing elapsed times and a JSON-escaped ESC survived round-trip; a `resize` before first output changes the header dims while a `resize` after output emits an `["r","<cols>x<rows>"]` line; events for a different PTY id are ignored; `dispose` is idempotent; an `exit` event closes the recording.
3. Wire into `src/harness-manager.ts` (create/dispose the recorder); extend `src/harness-manager.test.ts` to assert a recorder is created on spawn and disposed on `pty`/`exit`, mirroring the existing screen-reader assertions.
4. `src/main.ts` init + clear wiring.

   *Steps 1–4 are the recording feature and are self-contained; steps 5–8 add monitor availability and depend only on the `HarnessScreenReader` that already exists, not on the recorder — but they belong here because they make the recorded output consumable.*

5. `src/harness-manager.ts` — add the `latestScreenText(label)` accessor (§6); extend `src/harness-manager.test.ts` to cover it (returns the reader's latest capture for a harness tab; `undefined` for a missing tab, a non-harness tab, and a harness tab with no capture yet — reuse the existing `capture()` test fixtures).
6. `src/monitor-harness-feed.ts` + `src/monitor-harness-feed.test.ts`: with a stubbed `managers.harness.latestScreenText`, assert it emits one entry per harness-view target on first sight, nothing for a non-harness target, nothing on a repeat with an unchanged `capturedAt`, and a fresh entry once `capturedAt` advances; group targets resolve to member tabs.
7. `src/monitor-manager.ts` — extract the seed loop, add `harnessSeen`, wire seed + flush (§8). Extend `src/monitor-manager.test.ts`: a monitor targeting a harness tab is seeded with its current screen and, after a new capture, its flush batch includes the harness screen text tagged with the tab label; an idle harness (no new capture) does not trigger a prompt. **Confirm `monitor-manager.ts` stays ≤200 counted lines** via `./scripts/run.mjs lint-files`.
8. Specs (`specs/harness-recording.md`; amend `specs/harness.md` and `specs/monitoring.md`).
9. Public documentation.

Run `./scripts/run.mjs check-diff` after each step.

## Verification

- `./scripts/run.mjs check-diff` after each step (lints changed files, typechecks, runs related server tests).
- Manual (host, not runnable in CI — no test spawns a real PTY): `harness claude` (or any installed harness), type a few prompts so it produces multi-line ANSI output, then close the tab. Confirm `.janissary/recordings/claude-<timestamp>.cast` exists, its first line is a valid `{"version":2,…}` header with the terminal's width/height, and `asciinema play .janissary/recordings/claude-<timestamp>.cast` replays the session with colors and timing intact. Resize the browser terminal mid-session and confirm an `[t,"r","<cols>x<rows>"]` line appears. Separately, `ssh <destination>` and confirm **no** `.cast` file is written for it (scope exclusion). Launch once normally and confirm the recordings dir is cleared; relaunch and confirm prior recordings survive.
- Manual monitor check: open `harness claude`, then from another tab run `monitor <persona> claude` (any persona). Let the harness produce output and wait one flush cycle (~30s); confirm the monitor emits a suggestion informed by the harness's on-screen content (its prompt saw `[claude]` output). Leave the harness idle across a further flush and confirm no new prompt fires (idle screens are deduped, not re-fed).
