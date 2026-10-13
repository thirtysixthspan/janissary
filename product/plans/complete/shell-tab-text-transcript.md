# Shell tab text transcript

**Complexity: 6/10** — a new server manager wrapping a headless-terminal row writer with asynchronous-parse flush ordering, an extraction out of the recorder, an RPC rename across server and web, and a new pushed per-tab field and metadata-row button; every piece has a close precedent, which keeps it out of the 7+ range.

## Summary

Write a readable plain-text transcript of every shell tab's terminal, alongside the asciicast recording that already exists, so what a shell session showed stays inspectable after the tab closes without replaying a `.cast` file, and give the shell tab an **Open transcript** button that opens it. The backlog entry reads verbatim: *"Write a readable, output-only terminal transcript for shell tabs alongside the existing asciicast recording, so command output remains inspectable after the tab closes. Parse the PTY stream as terminal output rather than stripping escape codes from raw bytes, and do not persist user input or its terminal echo; if the implementation cannot distinguish echoed input safely, omit it. Store the text transcript under `.janissary/shell-transcripts/`, bound its size, and clear/preserve it on the same fresh-launch and `--relaunch` lifecycle as recordings. Honor `recordShellTabs: false`. This covers transcript creation and retention only; making the transcript available to the launcher ACP summarizer is a separate feature."*

Questioning narrowed and in two places reversed that text: the transcript is the terminal's full normal-screen text — prompts and typed command lines included — rather than output only (decision 3), the file itself is uncapped with only memory awaiting disk bounded (decision 7), and the tab gains a retrieval button (decision 8).

The recording already captures everything a shell prints, but as a timed byte stream full of escape sequences; it is unreadable as text. The transcript is the same session rendered as the lines a person saw.

## Design decisions

1. **Parsed as terminal output, not escape-stripped.** Established by the feature text. The PTY stream is fed through a server-side `@xterm/headless` terminal, as `HarnessScreenReader` already does for harness tabs (`src/harness/screen.ts`), and what is written is that terminal's rendered rows, so colours, cursor movement, carriage-return redraws and other control sequences never reach the file.
2. **One file per shell session, under `.janissary/shell-transcripts/`.** The directory is established by the feature text. The file is `<sanitized-label>-<ISO-timestamp>.txt`, named by the shared `harnessArtifactFilename` (`src/harness/artifact-name.ts`) exactly like a harness transcript, so two shell tabs never collide and a tab's transcript and recording share a stem. It is created lazily on the shell's first output, like the recording.
3. **The transcript is the shell's full normal-screen text as displayed, prompts and typed command lines included.** (User answers, rounds 4–5; supersedes the backlog's "output-only".) Every row the terminal draws on its normal screen is written: the `> ` prompt and the command typed at it, each command's output, output a background job prints while zsh is at its prompt, and whatever the startup files print before the first prompt. There are no separators, timestamps or annotations — the prompt lines already mark where each command begins, so the file reads as a plain-text replay of the session.
4. **Input is persisted as the terminal echoed it, and the spec says so.** (User answer, round 5; deliberately departs from the backlog's "do not persist user input or its terminal echo; if the implementation cannot distinguish echoed input safely, omit it".) No attempt is made to tell echoed input from output. A secret typed on a command line (`export TOKEN=…`) or echoed by an interactive program inside a command (a python REPL, `read`) lands in the transcript; a secret typed at a prompt that disables echo (`sudo`, `ssh` and `psql` passwords) prints nothing, so nothing of it reaches the file. The mitigations are the recording's: the file is under the project's own `.janissary/`, is never served over the network or handed to a client except when the user presses **Open transcript**, and is cleared at the next fresh launch. `recordShellTabs: false` is the opt-out.
5. **Rows are written as displayed, one file line per screen row, once, when the cursor first moves below them.** (User answers, rounds 3, 5 and 6.) A line longer than the terminal is wide is written as the rows it wrapped onto, so the file follows the tab's width at the time. A row is appended the first time the cursor moves below it — so **Open transcript** during a long-running command shows its output so far — and is never revisited: a row a program later redraws (a multi-line progress display, a zsh completion menu) keeps the form it had when first written, and `clear` removes nothing already written. A row redrawn by carriage returns before the cursor leaves it, such as a single-line progress bar, is written once in its final form.
6. **Full-screen programs leave nothing in the transcript.** (User answer, round 3.) Whatever a program draws on the terminal's alternate screen (vim, less, top) is not written; normal-screen output before and after it still is.
7. **The file has no size cap; only memory waiting for disk is bounded.** (User answers, rounds 1–2; the backlog's "bound its size" is met this way.) The writer reuses the recorder's in-memory pending-write limit at the same 4 MiB (`MAX_PENDING_RECORDING_BYTES`, `src/harness/recorder.ts:8`): if accepting the next write would exceed it, the transcript stops for the rest of the session and raises the failure notification (decision 10). The file otherwise grows for as long as the shell runs, and is bounded in time by the fresh-launch clear.
8. **An `Open transcript` button on the shell tab's metadata row, drawn with the clipboard icon, behaving like the harness tab's.** (User answers, rounds 1–2.) It mirrors the harness tab's existing button (`web/src/harness/HarnessTabMeta.tsx:116`: class `tab-open-transcript`, `viewCaptureIcon` — the regular-weight `faClipboard`): tooltip and accessible name `Open transcript`, and pressing it opens the file as it stands in an editor tab named `transcript <label>` (`src/controller/transcript.ts:10`). With `recordShellTabs: false` there is no transcript and the button is not drawn.
9. **Cleared at a fresh launch and preserved across `--relaunch`; `recordShellTabs: false` writes nothing.** Established by the feature text. The directory is a new `always: false` entry in `STATE_DIRECTORY_ENTRIES` (`src/state/dirs.ts`), and the transcript is installed on exactly the terminals a shell recording is installed on, behind the same gate (`TabManager.recordTerminal`, `src/tab/manager.ts:229`).
10. **A write failure records one `shell transcript failed` line in the notifications feed for that tab and leaves the shell unaffected.** (User answer, round 2.) A new notification kind beside `shell-recording-failed`: lower-case, fired at most once per tab, and listed in `EXPLICIT_EVENTS` so focus suppression cannot swallow it. An unwritable directory and the pending-write limit both raise it. The recording is independent: either can fail without stopping the other.
11. **The unfinished line is flushed when the session ends.** (User answer, round 4.) When the tab closes or zsh exits, whatever is on the cursor's row — a prompt waiting for input, a progress bar — is written as-is, then the file is closed.
12. **Remote shells get a transcript on the same terms as local ones.** (User answer, round 3.) Because the transcript is installed wherever a shell recording is, a remote shell or remote sibling gets its transcript written locally under `.janissary/shell-transcripts/` and shows the same button.
13. **Application command replies are left out.** (User answer, round 4.) A reply such as `help`'s, and the command line echoed above it, are drawn by the browser rather than printed by zsh, so they never pass through the PTY and never reach the transcript.

### Implementation decisions

14. **A separate `shellTranscript` manager in `src/shell/transcript/`, not a `HarnessRuntime` member.** (User answers, implementation rounds 1–2.) `ShellTranscriptManager` is a new `Managers` member owning one writer per shell PTY: `install(ptyId, label)`, `closeTab(label)` (listed in `MANAGER_TAB_RELEASE`), release of a writer on its PTY's `exit` event, and disposal of every writer at shutdown. `managers.shell` is already the unrelated line-oriented `ShellManager`, so the new key is `shellTranscript`. `TabManager.recordTerminal` (`src/tab/manager.ts:229`) calls `install` on the same line, behind the same `recordsTerminal` and `recordShellTabs` conjuncts, as `registerShellObservers` — so the transcript is installed on exactly the terminals that are recorded, remote shells included, and the recording and transcript stay independent observers of the same bus.
15. **Rows are detected by tracking the last written row.** (User answer, implementation round 1.) The writer marks the next row to write with an xterm marker (`terminal.registerMarker(0)` on the cursor's row, an `IMarker` whose `line` follows its row as the buffer scrolls and trims) rather than a raw absolute index, which would drift by one row per line once the scrollback is full and trimming begins. On each xterm `onLineFeed`, and on exit or disposal, it writes every normal-buffer row from the marker's `line` up to the row above the cursor (up to and including the cursor's row on exit or disposal, decision 11), disposes the marker and registers a fresh one on the cursor's row. If the marker has been disposed by the buffer — its row trimmed away, or erased by `clear` / a terminal reset — the writer resumes from the cursor's row, so nothing already written is repeated and no index points past the buffer. This covers auto-wrapped rows, which advance without a line feed. The headless terminal keeps a bounded scrollback so rows that have scrolled off the screen since the last line feed are still readable; while the alternate buffer is active nothing is written, and the normal buffer's marker is left where it was for writing to resume from when the program leaves the alternate screen.
16. **The button reaches the server through the existing transcript RPC, widened and renamed `openTranscriptFileFor`.** (User answer, implementation round 1.) `openHarnessTranscriptFor` becomes `openTranscriptFileFor`, and its controller resolves the label's harness tailer file first and the shell tab's remembered `tab.transcript` (decision 17) second, opening whichever it finds in an editor tab named `transcript <label>` and silently no-opping otherwise. No new protocol method; the rename runs through every place the method name appears.
17. **The client learns of the transcript from a pushed `transcript` path on the tab record.** (User answers, implementation rounds 1–2.) The writer's `onOpened(path)` callback sets `tab.transcript`, `buildTabView` copies it onto `PluginTabView`, and the plugin client capabilities gain `transcript?: string` and `openTranscript?()`, supplied together or not at all — the `recording` / `openRecording` precedent exactly. The file opens on the shell's first output, which zsh's prompt provides at once, so in practice the button appears as the shell starts; under `recordShellTabs: false` no writer exists, the field is never set, and the button is never drawn.
18. **The bounded append file is extracted from `HarnessRecorder` and shared.** (User answer, implementation round 2.) The recorder's lazy-open, single-stream, pending-byte-limited, fail-once append logic moves into one module both the recorder and the transcript writer use, so the 4 MiB rule has a single implementation.

## What already exists (reuse, don't rebuild)

| Piece | Where |
| --- | --- |
| `HarnessRecorder` — the per-PTY observer on the `pty` bus: lazy file open on first output, single append stream, 4 MiB pending-write cap, one failure callback | `src/harness/recorder.ts` |
| `TabManager.recordTerminal` — the one place shell observers are installed, gated by `recordsTerminal` and `recordShellTabs` | `src/tab/manager.ts:229`, called from `src/tab/openers.ts:179,216` |
| `registerShellObservers` / `shellRuntime` / `HarnessRuntimes` — the recorder's install, construct and release-on-exit-or-close path; the model for `ShellTranscriptManager`'s lifecycle, **not** extended by this plan (decision 14) | `src/harness/manager.ts`, `src/harness/observers.ts`, `src/harness/runtime-registry.ts` |
| `HarnessScreenReader` — `@xterm/headless` mirror of a PTY, including the CommonJS import workaround and the "read the buffer only after `write('', cb)` drains" rule | `src/harness/screen.ts` |
| Recording and harness-transcript directory modules — the init/ensure/path/clear shape to copy | `src/harness/recording-file.ts`, `src/harness/transcript-file.ts` |
| `<sanitized-label>-<ISO-timestamp>` filename builder | `src/harness/artifact-name.ts` |
| State-directory registry with fresh-launch clear and relaunch preserve | `src/state/dirs.ts` |
| Harness **Open transcript** button and its label-keyed RPC, opening the file in an editor tab | `web/src/harness/HarnessTabMeta.tsx:116`, `web/src/harness/harness-tab-intents.ts`, `src/controller/transcript.ts:10`, `src/protocol/core-rpc.ts:58` |
| The `recording` field pushed on `PluginTabView` and the `openRecording` client capability — the precedent for a host-pushed per-tab file and its opener on a plugin tab | `src/protocol/plugin.ts:17`, `web/src/plugins/api.ts:264-357`, `web/src/plugins/PluginBody.tsx:184` |
| `ShellTabMeta` — the shell tab's own metadata row, whose comment currently explains why it omits **Open transcript** | `web/src/plugins/shell/ShellTabMeta.tsx` |
| `shell-recording-failed` notification kind | `src/notifications/index.ts`, `src/notifications/format.ts` |
| Real-temp-dir recorder test harness | `src/harness/recorder.test.ts` |

## Proposed changes

Prose only. Names are contracts, not code.

### Shared bounded append file (decision 18)

- New `src/bounded-append-file.ts`, beside `src/atomic-write.ts`: a `BoundedAppendFile` that, given a path factory, a pending-byte limit and a failure callback, opens one append stream on its first write (ensuring the directory), reports the opened path once, refuses and abandons on a write that would push `writableLength` past the limit or on a stream `'error'`, fires its failure callback at most once, and closes on `dispose()`. `MAX_PENDING_RECORDING_BYTES` moves with it (renamed to describe the rule rather than recordings) and `src/harness/recorder.ts` uses it in place of its own stream handling, keeping its header-then-`onOpened` ordering and its behavior unchanged.

### Transcript directory (decisions 2, 9)

- New `src/shell/transcript/transcript-file.ts`, in the shape of `src/harness/transcript-file.ts`: init to `<project>/.janissary/shell-transcripts`, ensure, `shellTranscriptPath(label, startedAt)` through `harnessArtifactFilename` with a `.txt` extension, and clear.
- `src/state/dirs.ts` — a new `shellTranscript` entry (`always: false`) and its key in `KNOWN_STATE_DIRECTORY_KEYS`.

### Writer and manager (decisions 1, 3, 5–7, 10, 11, 14, 15)

- New `src/shell/transcript/writer.ts` — `ShellTranscriptWriter(ptyId, label, cols, rows, onFailure, onOpened)`: subscribes to the `pty` bus for its id; mirrors `data` into an `@xterm/headless` terminal (the CommonJS default-import workaround from `src/harness/screen.ts`), with a bounded scrollback; applies `resize`; on `onLineFeed` appends the finished normal-buffer rows (decision 15), each through `translateToString(true)` plus a newline, to its `BoundedAppendFile`; skips writing while `buffer.active.type` is the alternate buffer. On `exit` or `dispose()` it unsubscribes from the bus at once (so nothing arrives after), then waits for the headless terminal's write queue to drain (`write('', cb)`, the same rule `HarnessScreenReader` documents at `src/harness/screen.ts:69`) before flushing the remaining rows through the cursor's row, closing the file, and disposing the headless terminal — so the last bytes before exit are not lost to xterm's asynchronous parse. Exit and dispose share that one finishing path and it runs once; a second call is a no-op. The `onLineFeed` handler reads the buffer synchronously inside the parse, where the cursor and rows are consistent; nothing else reads the buffer outside a drained `write` callback.
- **Scrollback value:** 1000 rows. The writer only needs the rows between two line feeds (one logical line's wrapped rows) to survive; a single unbroken line longer than 1000 × columns loses its earliest rows, which is accepted and noted in the writer's comment.
- **Remote shells** need no special case: `spawnRemotePluginTerminal` (`src/tab/manager.ts:215`) is handed the same recorded PTY id, and `recordTerminal` installs on that id, so the writer sees the same `pty` bus events the recorder does.
- New `src/shell/transcript/manager.ts` — `ShellTranscriptManager`: `install(ptyId, label)` builds a writer with `managers.pty.spawnDimensions()`, an `onFailure` that fires `notify(managers, 'shell-transcript-failed', label)`, and an `onOpened` that sets `tab.transcript` on the tab with that label if it still exists; `closeTab(label)` disposes that label's writer; a `pty` `exit` releases the writer for that id; `dispose()` disposes all.
- `src/managers.ts` — `shellTranscript: ShellTranscriptManager` in `ManagerRegistry`; `'shellTranscript'` in `MANAGER_DISPOSE_ORDER` directly after `'harness'` and before `'pty'` (group 1: it owns open file handles and must flush while the PTY manager is still up), and in `MANAGER_TAB_RELEASE`. The compile-time completeness checks (`MANAGER_DISPOSE_ORDER_IS_COMPLETE`, `MANAGER_TAB_RELEASE_IS_COMPLETE`) fail until all three are present, which is the intended guard. `src/controller/create-managers.ts` constructs it beside `managers.harness = new HarnessManager(managers)` (`:70`).
- Test fixtures that build a full `Managers` object by hand will need the new member; let the typecheck name them rather than hunting in advance.
- `src/tab/manager.ts` — `recordTerminal` calls `this.managers.shellTranscript.install(ptyId, label)` beside `registerShellObservers`, under the same condition. Measure the file before editing; it is near the 200-line limit, and any overflow is extracted, not compacted.

### Notification (decision 10)

- `src/notifications/index.ts` — `'shell-transcript-failed'` in `NotificationEventType` (`:66`, beside `'shell-recording-failed'`) and `EXPLICIT_EVENTS` (`:123`); `src/notifications/format.ts` — `case 'shell-transcript-failed'` returning `shell transcript failed` beside `:70`; `src/notifications/sound-category.ts` — `'shell-transcript-failed': 'error'` beside `:27` (a typed record over every kind, so the typecheck also demands it).

### Pushed path and RPC (decisions 8, 16, 17)

- `src/tab/types.ts` — optional `transcript?: string` on the `Tab` record; `src/protocol/plugin.ts` — `transcript?: string` on `PluginTabView`, commented like `recording`; `src/tab/view.ts` — `buildTabView` copies it for a plugin tab.
- Rename `openHarnessTranscriptFor` → `openTranscriptFileFor` in `src/protocol/core-rpc.ts`, `src/client-message.ts`, `src/client-params/core.ts`, `src/message/handler.ts`, `src/message/tabs.ts`, `src/controller.ts`, `src/controller/transcript.ts` (and the comment in `src/controller/recording.ts`), and on the client in `web/src/harness/harness-tab-intents.ts` and `web/src/harness/HarnessTab.tsx`. The tests that name the method move with it: `src/message/handler.test.ts`, `src/controller.test.ts`, `src/client-params/core.test.ts`, `src/controller/recording.test.ts`, `src/controller/transcript.test.ts`, `web/src/harness/harness-tab-intents.test.ts`, `web/src/harness/HarnessTab.test.tsx`. No spec or documentation names the method. `openTranscriptFileFor(managers, label)` in `src/controller/transcript.ts` resolves `managers.harness.transcriptTailer(label)?.transcriptFile() ?? managers.tab.byLabel(label)?.transcript`. The path has one source, the tab record; the manager deliberately exposes no lookup of its own.

### Client (decisions 8, 17)

- `web/src/plugins/api.ts` — `transcript?: string` and `openTranscript?()` on `TabPluginClientCapabilities`, supplied together in `createPluginClientCapabilities` when the pushed path is present, `openTranscript` sending `openTranscriptFileFor` with the tab's label.
- `web/src/plugins/PluginBody.tsx` — reads `plugin.transcript` off the envelope beside `plugin.recording` and adds it to the capabilities `useMemo` dependencies, so a docked shell's button works too.
- `web/src/plugins/shell/ShellTabMeta.tsx` — when `capabilities.openTranscript` is present, a `tab-open-transcript` button with `viewCaptureIcon`, tooltip and accessible name `Open transcript`, placed after the split (`plusMinusIcon`) button and before the connections window button, the order `HarnessTabMeta` uses (`web/src/harness/HarnessTabMeta.tsx:116`, `className="tab-open-transcript"`); the component comment saying the row omits **Open transcript** is replaced. `viewCaptureIcon` is not on the plugin api barrel today — add it to the icon re-export at `web/src/plugins/api.ts:94` (`export { detachSessionIcon, … plusMinusIcon } from '../shared/icons'`) rather than importing `../../shared/icons` from the plugin.

### Specs and documentation

- `product/specs/shell-tab.md` — a "Text transcript" section beside § Session recording carrying decisions 2–7 and 9–13, including the input-persistence consequence in the same terms § Session recording uses; § The metadata row gains the **Open transcript** button and its `recordShellTabs: false` absence; the paragraph "There is no **open transcript** control, because there is no transcript" is rewritten; the `Cmd+F` sentence's "a plugin tab has no transcript to search" stays true (the file is not searchable in-tab) but is reworded so it does not contradict the new section.
- `product/specs/harness-recording.md` — a cross-reference noting shell tabs also write a text transcript under `.janissary/shell-transcripts/`, gated by `recordShellTabs`.
- `documentation/user-documentation/` — the shell tab page gains the transcript and button.

### Implementation order

Each step leaves typecheck and tests green on its own.

1. Extract `BoundedAppendFile` and move `HarnessRecorder` onto it, with `src/harness/recorder.test.ts` unchanged and green.
2. Rename `openHarnessTranscriptFor` → `openTranscriptFileFor` everywhere, behavior unchanged.
3. The `shell-transcript-failed` notification kind — inert until step 5 fires it.
4. The transcript directory module and its `src/state/dirs.ts` entry.
5. `ShellTranscriptWriter` and its tests.
6. `ShellTranscriptManager`, its `Managers` registration, and the install call in `TabManager.recordTerminal`.
7. `Tab.transcript` / `PluginTabView.transcript` and the shell branch in `openTranscriptFileFor`.
8. The client: capabilities, `PluginBody`, the icon re-export, and the `ShellTabMeta` button.
9. Specs and documentation.

Steps 1–4 are independent of each other.

## Tests

- `src/bounded-append-file.test.ts` — lazy open on first write, `onOpened` once, the pending-byte limit abandons and fires the failure callback once, a stream error does the same, dispose closes. `src/harness/recorder.test.ts` stays green unchanged, as the extraction's regression guard.
- `src/shell/transcript/writer.test.ts` — real temp directory and `pty` bus events, in the style of `src/harness/recorder.test.ts`: escape sequences and colours are absent from the file; a prompt line and a command's output are written; a carriage-return progress line is written once in its final form; a line wider than the terminal is written as its wrapped rows; alternate-screen content is absent while normal-screen output around it is present; a row redrawn after being written keeps its first form; output past the scrollback size (more than 1000 rows) is written whole with no repeated or skipped row; `clear` (including its scrollback erase) neither repeats nor drops rows written after it; the unfinished cursor row is flushed on exit and on dispose; a resize changes the wrap width for later rows; no file is created before the first output.
- `src/shell/transcript/manager.test.ts` — `install` sets `tab.transcript` once the file opens; `closeTab` and a `pty` exit release the writer; a failure notifies `shell-transcript-failed` once.
- `src/state/dirs.test.ts` — the new entry clears on a fresh launch and is preserved on relaunch.
- `src/tab/manager.test.ts` — `recordTerminal` installs the transcript beside the recorder, and installs neither under `recordShellTabs: false`.
- `src/controller/transcript.test.ts` — `openTranscriptFileFor` opens a harness tab's tailer file, a shell tab's transcript, and no-ops for a label with neither.
- `src/notifications/format.test.ts` — the `shell transcript failed` text.
- `src/message/handler-exhaustive.test.ts` and `src/client-message.test.ts` stay green across the rename.
- `web/src/plugins/api.test.ts` — `transcript` and `openTranscript` are supplied together or not at all.
- `web/src/plugins/shell/ShellTabMeta.test.tsx` — the button is drawn with its title when `openTranscript` is present, absent otherwise, and pressing it calls `openTranscript`.

## Out of scope

- Making the transcript available to the launcher ACP summarizer — a separate feature.
- Filtering echoed input or secrets out of the transcript (decision 4).
- A total size cap or rotation of the file (decision 7).
- Separators, timestamps or exit statuses in the file (decision 3).
- Alternate-screen content (decision 6) and application command replies (decision 13).
- Reflecting later redraws of rows already written (decision 5).

## Verification

- `$janissary/scripts/run.mjs check-diff`
- Manual: launch the app, run `ls` and `echo hello` in a shell tab, press **Open transcript** and confirm the editor tab `transcript <label>` shows the prompts, both commands and their output with no escape sequences. Run `vim`, quit it, and confirm none of its screen appears. Close the tab and read the newest file under `.janissary/shell-transcripts/`. Relaunch with `--relaunch` and confirm the file survives; relaunch fresh and confirm the directory is cleared. Set `"recordShellTabs": false` and confirm no file is written and the button is not drawn.
