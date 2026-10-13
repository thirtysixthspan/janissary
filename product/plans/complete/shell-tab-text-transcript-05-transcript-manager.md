# Shell tab text transcript 05: `ShellTranscriptManager`, registration, and install

**Complexity: 5/10** — a new manager holding one writer per PTY with install / reinstall / close-tab / exit-release / awaited-and-bounded shutdown paths, a small promise-returning `dispose()` added to the already-landed `BoundedAppendFile` and `ShellTranscriptWriter` so shutdown can wait for the final row, a new `Managers` member that the compile-time checks force into three lists, a new optional `Tab` field, and roughly ten hand-built test fixtures the typecheck cannot name; every piece has a direct precedent, so it stays well below 7.

## Goal

Install a `ShellTranscriptWriter` on exactly the terminals a shell recording is installed on, own those writers' lifecycles, report a failure once per tab in the notifications feed, and remember the opened file on the tab record as `tab.transcript`. After this subplan every recorded shell tab writes a transcript file, including its last unfinished row when the app quits; the client cannot open it yet.

Source plan: implementation-order step 6, plus the `Tab.transcript` field from step 7 (the manager's `onOpened` writes it, so it lands here; the view and RPC halves of step 7 are subplan 06).

## Design decisions carried from the source plan

- **Decision 9** (install gate) — installed on exactly the terminals a shell recording is installed on, behind the same `recordsTerminal` and `recordShellTabs` conjuncts in `TabManager.recordTerminal`; `recordShellTabs: false` installs nothing, so no file is written.
- **Decision 10** (wiring half) — a writer's `onFailure` fires `notify(managers, 'shell-transcript-failed', label)`, at most once per tab (see "Once per tab" below); the recording is independent, so either can fail without stopping the other.
- **Decision 11** (lifecycle half) — closing the tab disposes the writer, which flushes the unfinished row (subplan 04's finishing path). Quitting the app does the same, and shutdown waits for that flush to reach disk (see "Shutdown" below).
- **Decision 12** — remote shells and remote siblings get a transcript on the same terms, because `recordTerminal` installs on the recorded PTY id `spawnRemotePluginTerminal` is handed (`src/tab/manager.ts:214`, `spawnRemoteTerminal(label, options, recordedPtyId?)`); no special case.
- **Decision 14** — a separate `shellTranscript` manager in `src/shell/transcript/`, not a `HarnessRuntime` member: `install(ptyId, label)`, `closeTab(label)` (listed in `MANAGER_TAB_RELEASE`), release on the PTY's `exit`, dispose all at shutdown; key `shellTranscript` because `managers.shell` is the unrelated `ShellManager`.
- **Decision 17** (server-record half) — a writer's `onOpened(path)` sets `tab.transcript` on the tab with that label if it still exists.

## Decisions made in this subplan

- **Shutdown waits for the final row, with a bound.** Subplan 04's handoff is real: `ShellTranscriptWriter.dispose()` (`src/shell/transcript/writer.ts`, `dispose(): void { this.finish(); }`) returns before the drained `write('', cb)` writes the cursor row, and `BoundedAppendFile.dispose()` (`src/bounded-append-file.ts`, `this.stream?.end()`) does not wait for the stream either. Every exit path goes through `close()` in `src/index.ts` (`try { await controller.shutdown(); } …` then `process.exit` via `requestExit` / `armExit`), and `Controller.shutdown` (`src/controller.ts`, `disposeFrom`) already awaits a disposer that returns a promise before disposing the next one — `AgentRunManager.dispose(): void | Promise<void>` (`src/agent/manager.ts:121`) is the precedent. Without waiting, the last-window-closed path (`armExit` → `close()` with no clients, so `http.close` calls back almost at once) reaches `process.exit` before xterm's drain macrotask runs, and the waiting prompt — plus any output still unparsed or in the stream's buffer — is lost. Closing the last non-docked tab also exits through shutdown rather than through the tab-close walk (`src/tab/cleanup.ts` comment), so decision 11 would not hold for it either. Therefore:
  - `BoundedAppendFile.dispose()` returns `Promise<void>`: resolved when the stream emits `'close'` (which a `WriteStream` does after `'finish'` and after a destroy on error, so it covers both), resolved at once when no stream was ever opened or the file was already abandoned, and never rejected. A second `dispose()` returns the same promise. `HarnessRecorder` (`src/harness/recorder.ts:67`, `this.file.dispose();`) keeps ignoring the result; the recorder's behavior and its tests are unchanged (there is no `no-floating-promises` rule in `eslint.config.mjs`).
  - `ShellTranscriptWriter.dispose()` returns `Promise<void>` that settles once the finishing path has fully completed: the drained callback has run (`close(flush)`: the final flush, then `file.dispose()`), and the file's dispose promise has resolved. It is one promise per writer, created by the first `finish()`, so an `exit` or a failure followed by `dispose()` returns the promise of the finish already under way. On the path where xterm refuses even the drain write (`close(false)` synchronously in `finish()`), it settles when the file's promise does. It never rejects. This revises subplan 04's "no promise" surface note; nothing else about the writer changes.
  - `ShellTranscriptManager.dispose()` returns `void | Promise<void>`, in the shape of `AgentRunManager.dispose`: with no writers held it returns nothing (so `managers.test.ts`'s un-awaited `controller.shutdown()` stays synchronous); otherwise it returns a promise that resolves when every writer's dispose promise has settled **or** `SHELL_TRANSCRIPT_SHUTDOWN_WAIT_MS` (1000 ms, a named constant exported from `manager.ts`) has elapsed, whichever comes first, clearing its timer when the writers win. The cap exists because a stalled disk never emits `'close'` and a near-limit unparsed backlog (the writer's 4 Mi-character `MAX_UNPARSED_CHARS`) takes xterm many time slices to parse; quitting must not hang on either. The normal case is a few milliseconds. It never rejects.
  - Being in dispose group 1 before `'pty'`, the awaited manager finishes while the shells are still alive, so no PTY `exit` races the flush, and the bus is cleared (`messageBus.clear()` at the end of `disposeFrom`) only after.
  - Not covered, and accepted: a crash or `SIGKILL` loses the unflushed tail, as it does for the recording.
- **Exit release drops without disposing.** The manager's own `pty` `exit` subscription removes the entry for that id (only if the stored writer is still the one it held for that id) and does not call `dispose()`: the writer's own `exit` listener runs the finishing path, and `finish()` is idempotent, so the result is the same whichever listener the bus runs first. The `queueMicrotask` deferral in `HarnessRuntimes` (`src/harness/runtime-registry.ts:23`) is not needed here, because nothing in the transcript writes an exit status.
- **Reinstall on a held id releases the old writer first**, as `HarnessRuntimes.install` (`src/harness/runtime-registry.ts:41`) does: a reattached remote sibling can be recorded again under the id the far side already knows, and two writers on one id would write every row into two files. The new writer opens a new file (a new `startedAt`), and its `onOpened` overwrites `tab.transcript` with the newer path — the same overwrite `rememberRecording` does for `recording`.
- **Once per tab.** One tab can hold several writers (a factory that starts two terminals — see the "records every terminal one factory started" case in `src/tab/manager.test.ts`), and a reinstall creates another, so the manager keeps a set of labels already notified and calls `notify` only for a label not in it; `closeTab(label)` removes the label from the set so a later tab reusing the label can be notified again.
- **`onOpened` looks the tab up at call time** through `managers.tab.byLabel(label)` and does nothing when it is gone, like `rememberRecording` (`src/harness/observers.ts:23`).

## Dependencies

- Subplan 03 — the `shell-transcript-failed` notification kind (landed: `src/notifications/index.ts:68`, `:126`).
- Subplan 04 — `ShellTranscriptWriter` (landed: `src/shell/transcript/writer.ts`, with `row-tracker.ts` and the unparsed-output cap).
- Both are committed; nothing else must land first. Subplan 06 reads `tab.transcript` and depends on this one.

## Existing code to reuse

| Piece | Where | Use |
| --- | --- | --- |
| `ShellTranscriptWriter(ptyId, label, cols, rows, onFailure, onOpened, maxUnparsedChars = MAX_UNPARSED_CHARS)` | `src/shell/transcript/writer.ts` | The manager passes the first six; the seventh stays defaulted |
| `TabManager.recordTerminal` | `src/tab/manager.ts:229` (`if (declares && getConfig().recordShellTabs) this.managers.harness.registerShellObservers(ptyId, label);`) | Add the install under the same condition; callers are `src/tab/openers.ts:179` and `:216` and need no change |
| `HarnessRuntimes` — per-PTY map with label, install-releases-first, `closeTab` by label, `pty` `exit` subscription, `dispose` unsubscribes then releases all | `src/harness/runtime-registry.ts` | The shape to copy for the manager's map |
| `rememberRecording` / `shellRuntime` | `src/harness/observers.ts:23`, `:95` | `onOpened`-sets-tab-field model and the `spawnDimensions()` + `notify` wiring; **not** extended (decision 14) |
| `AgentRunManager.dispose(): void \| Promise<void>` | `src/agent/manager.ts:121` | Return nothing when idle, a promise otherwise |
| `Controller.shutdown` awaiting promise-returning disposers in order | `src/controller.ts` (`disposeFrom`) | Why returning a promise is enough to hold `pty` and everything after it |
| `managers.pty.spawnDimensions()` | `src/pseudoterminal-manager.ts:143` | Writer's initial size |
| `notify(managers, event, tabLabel, message?, options?)` | `src/notifications/index.ts:188` | Failure notification, three arguments |
| `managers.tab.byLabel(label)` | `src/tab/lookup.ts:18` via `TabManager` | `onOpened` lookup |
| `ManagerRegistry`, `MANAGER_DISPOSE_ORDER`, `MANAGER_TAB_RELEASE` and `MANAGER_DISPOSE_ORDER_IS_COMPLETE` / `MANAGER_TAB_RELEASE_IS_TYPED` / `MANAGER_TAB_RELEASE_IS_COMPLETE` | `src/managers.ts` | Register the new member |
| Manager construction | `src/controller/create-managers.ts:70` (`managers.harness = new HarnessManager(managers);`) | Construct on the next line, after `managers.pty` (`:67`) |
| `Tab.recording` field and its comment | `src/tab/types.ts:325-330` | Precedent for `Tab.transcript` |
| Real-temp-dir writer test harness (`emit`, `waitForSentinel`, `locked` chmod pattern) | `src/shell/transcript/writer.test.ts` | Manager test harness |

## Proposed changes

- New `src/shell/transcript/manager.ts` — `ShellTranscriptManager`, constructed with `managers`:
  - Holds a map from PTY id to `{ label, writer }` and the notified-label set; subscribes to the `pty` bus's `exit` at construction.
  - `install(ptyId, label)` releases any writer already held for `ptyId` (disposing it), then builds a `ShellTranscriptWriter` with `managers.pty.spawnDimensions()`, an `onFailure` that notifies once per label (decision above), and an `onOpened` that sets `transcript` on `managers.tab.byLabel(label)` when it exists.
  - `closeTab(label: string): void` disposes every writer held under that label (not awaiting), drops them, and forgets the label from the notified set. The `closeTab(label: string): void` signature is what `MANAGER_TAB_RELEASE_IS_TYPED` checks.
  - `exit` for a held id drops the entry as decided above.
  - `dispose()` unsubscribes, disposes every writer, clears the map, and returns as decided above.
  - The manager exposes no path lookup; the tab record is the single source (source decision 16, consumed in subplan 06).
  - Expected size is well under 100 lines; no extraction planned.
- `src/bounded-append-file.ts` — `dispose()` returns the close promise described above.
- `src/shell/transcript/writer.ts` — `dispose()` returns the finish promise described above; update the class comment's last sentence ("`dispose()` therefore returns before that final row reaches the stream") to say the returned promise settles once it has.
- `src/tab/types.ts` — optional `transcript?: string` on the `Tab` record, directly after `recording`, commented like it: the absolute path of this tab's text transcript, set by the writer that opened it on the shell's first output, remembered on the tab because the writer is released when the PTY exits while the tab and file outlive it; a reinstall overwrites it with the newer file. No other `Tab` member is named `transcript` today.
- `src/managers.ts` — a type-only import of `ShellTranscriptManager` from `./shell/transcript/manager.js` beside the others (the file imports every manager type-only); `shellTranscript: ShellTranscriptManager` in `ManagerRegistry`; `'shellTranscript'` in `MANAGER_DISPOSE_ORDER` directly after `'harness'` and before `'shell'` (group 1; extend the group comment: it owns open file handles, must flush while the shells it mirrors are still alive, and its disposal is awaited); and `'shellTranscript'` in `MANAGER_TAB_RELEASE` directly after `'harness'`. The completeness checks fail until all three are present, which is the intended guard.
- `src/controller/create-managers.ts` — `managers.shellTranscript = new ShellTranscriptManager(managers);` directly after `managers.harness = …`.
- `src/tab/manager.ts` — `recordTerminal` turns its one-line `if` into a block that calls `this.managers.harness.registerShellObservers(ptyId, label)` and then `this.managers.shellTranscript.install(ptyId, label)`. Extend the method comment by one sentence: the text transcript follows the recording's gate exactly. The file measures 184 lines under the `max-lines` counting (blank lines and comments skipped); the block adds at most three, so no extraction is needed.

## Hand-built `Managers` fixtures

The typecheck will **not** name these: every one is cast `as unknown as Managers`, so a missing member surfaces only as a runtime `TypeError` (`closeTabResources` calls `managers[name].closeTab(label)` for every listed name, `src/tab/cleanup.ts:37-40`, and `recordTerminal` calls `install`). Update each in the same commit as the registration:

- `shellTranscript: { install: vi.fn(), closeTab: vi.fn() }` where the fixture stubs `harness.registerShellObservers`: `src/tab/manager.test.ts` (`makeManagers`), `src/plugins/launch-tab.test.ts`, `src/plugins/terminal-refusal.test.ts`.
- `shellTranscript: { closeTab: vi.fn() }` where the fixture stubs `harness.closeTab` by hand for the release walk: `src/tab/cleanup.test.ts`, `src/plugins/grouping.test.ts`, `src/plugins/notifications.test.ts`, `src/plugins/teardown.test.ts`, `src/plugins/update-tab.test.ts`, `src/plugins/launcher/host-lifecycle.test.ts`.
- No change: fixtures built from `MANAGER_TAB_RELEASE` itself pick the member up automatically — `src/tab/close.test.ts:14`, `src/tab/operations.test.ts:17`, `src/sessions/harness-roundtrip.test.ts:90`.
- Before finishing, grep `src/` test files for `registerShellObservers: vi.fn()` and `harness: { closeTab` and confirm each hit also stubs `shellTranscript`.

## Tests

- New `src/shell/transcript/manager.test.ts`, on a real temp directory with `initShellTranscriptDirectory` and real `pty` bus events like `writer.test.ts`, a minimal `Managers` object (`tab.byLabel`, `pty.spawnDimensions`) cast through `unknown`, and `vi.mock` of `../../notifications/index.js` so `notify` is a spy:
  - `install` then one `data` event sets `tab.transcript` to a `.txt` path inside the shell transcript directory; with no tab of that label, nothing throws.
  - `closeTab(label)` finishes only that label's writers: a second label's writer keeps writing afterwards.
  - A `pty` `exit` drops the writer: a later `closeTab` for its label does not call the writer's `dispose` (spy on `ShellTranscriptWriter.prototype.dispose`).
  - `install` on an id already held disposes the earlier writer, and only one file receives later rows.
  - Two writers of one label failing (the unwritable-parent chmod pattern) call `notify` exactly once with `'shell-transcript-failed'` and that label; after `closeTab(label)`, a new writer's failure notifies again.
  - `dispose()` returns nothing with no writers; with writers, after `await manager.dispose()` the file already ends with the unfinished row (read synchronously, no polling) — this is the shutdown guarantee.
  - `dispose()` resolves once `SHELL_TRANSCRIPT_SHUTDOWN_WAIT_MS` has elapsed when a writer never settles (fake timers, with the writer's `dispose` spied to return a never-settling promise).
- `src/shell/transcript/writer.test.ts` — add: after `await writer.dispose()` the file ends with the sentinel with no polling; `exit` then `await dispose()` likewise; after a failure (the existing unwritable-directory case) `dispose()` resolves.
- `src/bounded-append-file.test.ts` — add: after `await file.dispose()` the written bytes are on disk; `dispose()` resolves at once when nothing was ever written, and after an abandon; a second `dispose()` resolves too. `src/harness/recorder.test.ts` stays green unchanged.
- `src/tab/manager.test.ts` — in the existing recording cases: the "records a plugin's terminal under the label its new tab was given" case also asserts `managers.shellTranscript.install` was called with `('pty1', tab.label)`; the "did not ask for it" and "`recordShellTabs: false`" cases assert it was not called; the "every terminal one factory started" case asserts two calls.
- `src/tab/cleanup.test.ts` — the "closes every per-tab resource keyed by the tab label" case also expects `managers.shellTranscript.closeTab` called with `'main'`.
- `src/managers.test.ts` — stays green; its "lists every registered manager exactly once" case proves the dispose-order registration. Add a case in the style of the existing ordering cases asserting `positionOf('shellTranscript')` is less than `positionOf('pty')` and less than `positionOf('shell')`.

## Verification

- `./scripts/run.mjs check-diff`, plus the fixture grep above.
- Manual integration check (server-side only; no button yet): launch the app, run `echo hello` in a shell tab, and confirm a `<label>-<timestamp>.txt` file appears under `.janissary/shell-transcripts/` containing the prompt, `echo hello` and `hello` with no escape sequences. Close the tab and confirm the file's last line is the trailing prompt (`>`). Open another shell tab, run `echo bye`, quit with Ctrl+C in the terminal running the app, and confirm that tab's file also ends with `>`. Set `"recordShellTabs": false`, relaunch, and confirm no new file appears.

## Out of scope

- `PluginTabView.transcript`, `buildTabView`, and the shell branch of `openTranscriptFileFor` — subplan 06.
- The client capability and the **Open transcript** button — subplan 07.
- Spec and documentation text — subplan 08.
- Making `HarnessRecorder`'s disposal awaited at shutdown; it ignores the new promise.
- Preserving the unflushed tail across a crash or `SIGKILL`.
