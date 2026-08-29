# SSH tab session recording

**Complexity: 3/10** — the recorder itself is reused verbatim, there is no new protocol, persistence, or UI surface, and the whole change is four small server-side edits plus specs. What lifts it above a 2 is a forced extraction: `src/harness/manager.ts` sits at 199 of the 200 counted lines `max-lines` allows, so the observer-construction block has to be moved into a new module before anything can be added, and that extraction has to keep the existing harness spawn path behaving identically.

## Summary

Record every ssh tab's PTY output to a replayable asciicast v2 `.cast` file, closing the audit gap named in the backlog: a remote session's output is gone the moment its tab closes, because `product/specs/harness-recording.md` § Scope excludes ssh tabs from the automatic recording that named-harness tabs get. This is deliberately a widening of scope, not a new mechanism — `HarnessRecorder` (`src/harness/recorder.ts`) already does exactly this job for harness PTYs, subscribing to the `pty` bus channel, opening its append stream lazily on the first output, and closing it when the PTY exits. An ssh tab spawns its PTY through `SshManager` (`src/ssh-manager.ts:37`) rather than `HarnessManager.finishSpawn`, and that separate spawn path is the only reason it has no recorder today.

Recording is automatic for every ssh session with no command, flag, or setting, and writes into the same `.janissary/recordings/` directory harness recordings already use, inheriting its naming, its clear-on-fresh-launch rule, and its preserve-across-`--relaunch` rule unchanged. Output and resize events only — keystrokes are never written, so a typed passphrase or sudo password cannot land on disk. There is no in-app viewer; `.cast` files are replayed externally with `asciinema play` or any asciicast web player, exactly as harness recordings are today.

This plan is recording only. Session transcripts and monitoring changes were considered and dropped: an ssh tab runs no harness binary and has no session record to tail, so any transcript would have to be synthesized from the PTY stream, and monitoring already works for ssh targets (see decision 7).

## Design decisions

1. **Automatic for every ssh tab.** Every `ssh <destination> […]` session records from spawn to exit. No command, no janissary-owned flag, no config setting. A flag was rejected on a concrete ground: every token after `ssh` is passed to the real `ssh` binary verbatim (`product/specs/ssh-tab.md` § Command), so any flag janissary intercepted would collide with ssh's own argument grammar — the same reason the ssh tab has no `as <label>` or `-w` clause.

2. **Output and resize only — no keystroke recording.** Identical to `HarnessRecorder`'s existing behavior: an `"o"` event per PTY `data` chunk and an `"r"` event per resize, with no asciicast `"i"` events. This is the privacy-load-bearing decision for a remote session: ssh prompts for passphrases and remote sudo passwords, and recording input would write them to disk in plaintext. It also keeps the file playable in every asciicast player, several of which ignore `"i"`.

3. **Same `.janissary/recordings/` directory.** ssh `.cast` files sit alongside harness ones under the existing `<label>-<timestamp>.cast` naming from `harnessArtifactFilename` (`src/harness/artifact-name.ts:6`), and share one lifecycle: cleared at a fresh launch, preserved across `--relaunch`. No second directory, no new init/clear wiring in `src/main.ts`, no new module. The accepted ceiling: ssh and harness recordings are not separable by directory, so telling them apart means reading each file's header `command` field or recognizing the tab label in the filename. If that becomes a real annoyance, the upgrade is a separate `.janissary/ssh-recordings/` with its own init/clear pair beside the existing ones at `src/main.ts:181,194` — deliberately not done now, because one directory needs no wiring at all.

4. **The cast header's `command` field carries the full verbatim ssh invocation.** Where a harness recording writes the bare program name (`claude`), an ssh recording writes the whole `ssh -p 2222 admin@host` line, so an auditor opening a stray `.cast` can tell which host it came from without inferring it from the tab label in `title`. Consequence worth stating: an invocation carrying a secret in a flag value (an `-o ProxyCommand=…` with an embedded credential, say) puts that secret in the header. The `.cast` file already records everything the remote host printed, so this does not change the file's sensitivity class, but it does mean the header is not safe to treat as non-sensitive metadata.

5. **A write failure disables the recorder silently and reports one notification.** The recorder keeps its existing non-fatal behavior — the ssh session is never affected by a recording problem — but an ssh tab additionally records a single line in the notifications feed. Rationale: for a feature whose whole purpose is after-the-fact audit, a silent gap is the one failure mode that defeats the point. Harness recording keeps failing silently; only ssh gets the notification, matching the wording in decision 6.

6. **The notification reads `ssh recording failed`.** Lower-case, article-free, tab label supplied by the notification header — matching `no harness transcript found`, the existing notification of the same shape (`src/notifications.ts:98`). Fired at most once per tab.

7. **No session transcript for ssh tabs, and no monitoring changes.** An ssh tab has no harness dot-directory session record, so `TranscriptSource` (`src/harness/transcript/source.ts:8`, `poll`/`resolved`) has nothing to tail and any ssh transcript would have to be synthesized from the PTY stream — a de-ANSI'd byte stream garbles under a remote `vim`/`htop`, and linearizing properly needs a second headless terminal with scrollback enabled (the existing `HarnessScreenReader` constructs its terminal with `scrollback: 0`, `src/harness/screen.ts:32`). Monitoring needs nothing either: `validateTargets` (`src/monitor/targets.ts:37`) does not discriminate by tab kind, and `harnessFeedEntries` skips only on `if (tab.view !== 'harness') continue` (`src/monitor/harness-feed.ts:41`) — which ssh tabs pass, since an ssh tab *is* a harness-view tab — so ssh targets already contribute rendered screen snapshots. The only feed they miss is the transcript feed, gated on a tailer existing (`if (!tailer) continue`, `src/monitor/harness-transcript-feed.ts:23`), which is out with the transcript itself.

8. **`product/specs/harness-recording.md` § Scope is corrected, not just extended.** That section states ssh tabs "get no screen reader either" — untrue: `SshManager.open` calls `registerScreenReader` (`src/ssh-manager.ts:38`). The sentence has to change anyway to say ssh tabs are recorded, so the stale screen-reader claim is corrected in the same edit rather than filed separately.

9. **No in-app retrieval, no retention policy.** No command to list, open, or play a `.cast`; no size cap, age cap, or pruning beyond the existing clear-on-fresh-launch. Both match harness recording exactly.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| `HarnessRecorder` — the asciicast v2 recorder, verbatim; lazy open on first output, `"o"`/`"r"` events, stream-`'error'` self-disable | `src/harness/recorder.ts` |
| Recording directory init / path builder / clear, already wired at both ends — nothing to add for decision 3 | `src/harness/recording-file.ts`, wired at `src/main.ts:181,194` |
| `<sanitized-label>-<ISO-timestamp>.cast` filename builder | `src/harness/artifact-name.ts:6` |
| `HarnessRuntime` — already takes an optional recorder as its second constructor parameter | `src/harness/runtime.ts:11-16` |
| Dispose-on-`pty`/`exit` for the whole runtime, so recorder teardown is free | `src/harness/manager.ts:37-41` |
| The ssh observer-registration seam and its single call site | `src/harness/manager.ts:72-75`, `src/ssh-manager.ts:38` |
| `capture-wire.ts` / `auto-approve-wire.ts` — the existing "split wiring out of `HarnessManager`" pattern the new observers module copies | `src/harness/capture-wire.ts:7-9` |
| The verbatim `ssh …` invocation, already in scope at the spawn site as `command` | `src/ssh-manager.ts:24,37` |
| Notification kind / text / always-eligible pattern to copy (`transcript-unavailable`) | `src/notifications.ts:26,48,98` |
| Real-temp-dir, poll-the-`.cast`-file recorder test harness | `src/harness/recorder.test.ts:9-41` |
| Mocked-`managers` `SshManager` test shape | `src/ssh-manager.test.ts:20-25` |

## Proposed changes

### `src/harness/recorder.ts` — two small widenings

Rename the third constructor parameter from `program` to `command`. It only ever feeds the asciicast header's `command` field, so the current name would lie about its contents once an ssh recorder passes a full invocation through it (decision 4). The harness call site keeps passing the program name; the value is unchanged there.

Add an optional final constructor parameter: a failure callback invoked at most once when recording is abandoned. The harness call site omits it and keeps failing silently; the ssh registration passes one that fires the notification (decision 5). Wire it to both failure paths, which today are not symmetric:

- The existing stream `'error'` handler sets the `failed` flag — invoke the callback there.
- `open()` (`src/harness/recorder.ts:60-77`) is currently unguarded, unlike `HarnessTranscriptTailer.open` (`src/harness/transcript/tailer.ts:76-88`), which wraps its equivalent in try/catch. A synchronous throw from `ensureRecordingDirectory` or `createWriteStream` (an `EACCES` on the project directory, say) escapes into the per-listener try/catch in `bus.emit` (`src/bus.ts:65`) and is swallowed, leaving `stream` undefined and `failed` false — so `onData`'s `if (!this.stream) this.open()` retries the whole open on every subsequent chunk for the life of the session and never writes anything. Wrap `open()`, set `failed`, and route to the same callback, so an open failure is reported once and not retried. This is a pre-existing defect in the harness recorder that this plan fixes rather than inherits.

### New module `src/harness/observers.ts` — a forced extraction, do this first

`src/harness/manager.ts` is at **199 of the 200 counted lines** `max-lines` allows (`eslint.config.mjs:61`, `{ max: 200, skipBlankLines: true, skipComments: true }`). Nothing can be added to it until something comes out, so the extraction is a prerequisite, not a cleanup — do it before any behavior change, as its own green checkpoint.

This is an established pattern here, not a new one: `src/harness/capture-wire.ts` and `src/harness/auto-approve-wire.ts` were both split out of `HarnessManager` on the same principle, stated in the former's own header comment — "the manager decides *that* a tab gets a reader, not what hangs off it" (`src/harness/capture-wire.ts:7-9`). Follow that module's shape: a small sibling in `src/harness/` exporting plain functions that take what they need, holding no state of its own.

Extract runtime construction — the "which observers does this PTY get" decision — into a new module exporting two factories, each returning a `HarnessRuntime` for the caller to store in the `runtimes` map:

- One for the harness path, taking what `finishSpawn` already has in scope (managers, harness name, label, PTY id, cwd, the auto-approve flag, and the remote channel or `undefined`). It moves the block currently spanning the `spawnDimensions()` call through the `HarnessTranscriptTailer` construction (`src/harness/manager.ts:220-227`, from `const dims =` to the `source ? new HarnessTranscriptTailer(…) : undefined` ternary) verbatim — capture wiring, screen reader, recorder, transcript source, tailer — leaving `finishSpawn` to call it and assign the result. Behavior must be identical; this is a move, not a redesign, and the existing harness tests are the guard.
- One for the ssh path, taking managers, PTY id, label, and the verbatim invocation. It builds the same `HarnessScreenReader` the ssh path gets today (spawn dimensions from `this.managers.pty.spawnDimensions()`, no capture handler — auto-approve and busy detection stay harness-specific), plus a `HarnessRecorder` over the same PTY id, passing the label, the invocation as the header `command`, and a failure callback firing the notification. It constructs no transcript source and no tailer, which is what keeps `transcriptTailer(label)` returning `undefined` for ssh tabs and therefore keeps decision 7 true.

Net effect on `manager.ts` is a reduction of roughly six counted lines before anything is added back, leaving headroom. Confirm with `./scripts/run.mjs lint-files` at this checkpoint rather than assuming — the count above was measured on the current file and will drift.

### `src/harness/manager.ts` — register both ssh observers, not one

`registerScreenReader(id)` becomes a two-observer registration and should be renamed to say so (`registerSshObservers`, or similar). It gains the ssh tab's label and the verbatim invocation as parameters and delegates to the ssh factory above, storing the result in `runtimes` as it does today. Both observers live in one `HarnessRuntime`, whose second constructor parameter is already the optional recorder (`src/harness/runtime.ts:11-16`), and whose `dispose` already calls `this.recorder?.dispose()` — so the constructor's existing `pty`/`exit` listener (`src/harness/manager.ts:37-41`) tears the recorder down with no change to that path.

`notify` is already imported here (`src/harness/manager.ts:18`), so the failure callback needs no new import.

The rename has exactly two call sites — `src/ssh-manager.ts:38` and the mock in `src/ssh-manager.test.ts:20` — confirmed by grepping `registerScreenReader` across `src/`. Update the method's comment: it no longer registers "a screen reader for a PTY this manager did not spawn itself" but the full observer pair.

### `src/ssh-manager.ts` — pass the label and invocation through

The single call site (`this.managers.harness.registerScreenReader(id)`, `src/ssh-manager.ts:38`) passes the PTY id, the unique `label`, and `command` — both already local to `open()` (`label` from `uniqueLabel` at `:26`, `command` the method's first parameter at `:24`, which `parseSshCommand` sets to the trimmed input verbatim, `src/ssh.ts:49`). Because the label is the disambiguated one, two concurrent `ssh devbox` tabs write `devbox-*.cast` and `devbox-2-*.cast` rather than colliding. No other change; at 32 counted lines the file has ample headroom.

### `src/notifications.ts` — a new notification kind

Add `'ssh-recording-failed'` to `NotificationEventType` (`src/notifications.ts:16-29`), and describe it in the type's leading comment block alongside the other kinds. Add it to the always-eligible group in `shouldNotify` — the first `switch`'s `return true` case list where `transcript-unavailable` sits (`src/notifications.ts:44-49`) — so focus suppression cannot swallow it; the tab whose recording just failed is very often the tab the user is watching, which is exactly the case the ambient rule at `if (tabLabel === activeLabel) return false` (`:57`) would discard. Add its `notificationText` case returning the fixed string from decision 6, alongside `case 'transcript-unavailable'` (`:98`); like that one it ignores `detail`. At 93 counted lines the file has headroom.

### Specs

- **`product/specs/harness-recording.md`** — rewrite § Scope: ssh tabs are now recorded; correct the false "they get no screen reader either" claim and the "keeping the two observers symmetric" rationale built on it, since both observers are in fact present for ssh. Note the one header difference (ssh writes its full invocation in `command`, a named harness writes the bare program name) in § File format, and the `ssh recording failed` notification in § File naming and lifecycle. Leave the existing sentence that ssh tabs get no session transcript and no `no harness transcript found` notification — still true, and now worth distinguishing from the new recording-failure notification.
- **`product/specs/ssh-tab.md`** — add a "Session recording" section: automatic for every session, written to `.janissary/recordings/`, output and resize only with keystrokes never recorded, created lazily on first output so an unreachable host leaves no empty file, closed when the ssh process exits, and cleared at a fresh launch but preserved across `--relaunch`. Cross-link `[[harness-recording]]`. The § Lifecycle line saying ssh's own error output "dies with the tab" needs a qualifier — auth failures and unreachable-host errors print before the process exits, so they do land in the recording even though they never reach the creator's transcript.
- **`product/specs/monitoring.md`** — unchanged. Its § Transcript access line about ssh tabs contributing screen snapshots only is already correct.

### Documentation

- `documentation/user-documentation/advanced-agents/harness.md:129` currently ends the Recordings section with "SSH sessions are not recorded." — that sentence is now false and must be replaced.
- The same file's "SSH sessions" section (from line 171) gains a short recording paragraph: automatic, where the file lands, that only remote output is saved and nothing typed is, and how to replay it. Reuse the existing `asciinema play` example shape rather than restating the format.

### Protocol and client

No changes. Recording is a server-side side effect on an existing bus subscription, and the notification rides the existing notifications feed. Nothing new crosses the wire, and no `web/` file is touched.

### `src/main.ts` — no changes needed

Already wired: `initHarnessRecordingDirectory(cwd)` at `src/main.ts:181` and `clearHarnessRecordingDirectory()` inside the `if (!args.relaunch) { … }` cleanup at `:194`. Reusing the same directory (decision 3) is what makes this a no-op; a separate ssh directory would have required both.

### Implementation order

Each step should leave typecheck and tests green on its own:

1. Extract `src/harness/observers.ts` and move `finishSpawn`'s observer block into it, behavior unchanged. Confirm `manager.ts` is back under the line limit before continuing.
2. Widen `HarnessRecorder`: rename the third constructor parameter, add the failure callback, guard `open()`. Harness behavior is unchanged because the harness call site passes no callback.
3. Add the `ssh-recording-failed` notification kind. Standalone and inert until step 4 fires it.
4. Add the ssh runtime factory, rename `registerScreenReader`, and update the `src/ssh-manager.ts` call site and its test mock together — the rename breaks the build between these two edits, so they land as one step.
5. Specs and documentation.

Steps 2 and 3 are independent of each other; both depend on step 1 only for line-budget headroom.

## Tests

Server tests only (vitest project `server`), colocated as `src/**/*.test.ts`. No `web/` tests — nothing crosses the wire:

- **`src/harness/recorder.test.ts`** (extend the existing suite, reusing its real-temp-directory and poll-the-file helpers): the header's `command` field carries whatever string is passed, including a full `ssh -p 2222 admin@host` invocation; the failure callback fires exactly once when the stream emits `'error'`, and no further events are written after it; the failure callback fires when the open path throws, and a subsequent `data` event does not retry the open (the regression guard for the swallowed-throw defect above). Simulate the open failure by pointing the recording directory at an unwritable path rather than by mocking `node:fs`, keeping the suite's existing no-`fs`-mock style.
- **`src/harness/manager.test.ts`**: registering the ssh observers creates a runtime holding both a reader and a recorder, and a `pty`/`exit` event for that id disposes both and drops it from the runtimes map. Assert `transcriptTailer(label)` still returns `undefined` for an ssh tab — that accessor is what tells an ssh tab from a real harness tab throughout the monitor feeds (`if (!tailer) continue`, `src/monitor/harness-transcript-feed.ts:23`), and it must not start returning a tailer as a side effect of this change. The existing harness-spawn assertions in this file are also the guard that step 1's extraction changed no behavior.
- **`src/ssh-manager.test.ts`**: update the mocked `managers.harness` stub to the renamed method and assert it receives the PTY id, the unique label, and the verbatim command — including a case where a second `ssh devbox` gets `devbox-2`, so the two sessions cannot write to the same file.
- **`src/notifications.test.ts`**: `notificationText('ssh-recording-failed', …)` returns the exact string; `shouldNotify` returns true for the new kind even when the ssh tab is the active tab and even with all ambient toggles off, matching the existing `transcript-unavailable` assertions at `src/notifications.test.ts:96-107`.
- **`src/monitor/harness-transcript-feed.test.ts`**: no change needed, but its existing "ssh tabs are rejected from the transcript feed" case (`:54-57`) is the guard that decision 7 stays true; confirm it still passes rather than editing it.

## Out of scope

- Keystroke/input recording (asciicast `"i"` events) — output and resize only, per decision 2.
- Any session transcript for ssh tabs, and therefore `harness transcript <ssh-label>` and the monitor transcript feed for ssh targets (decision 7).
- Any monitoring change — ssh targets already feed rendered screen snapshots and keep doing exactly that (decision 7).
- Any in-app viewer, list, open, or replay command for `.cast` files (decision 9).
- Retention, rotation, compression, or size caps on recordings (decision 9).
- A separate `.janissary/ssh-recordings/` directory or any change to the existing clear/preserve lifecycle (decision 3).
- Recording inline and full-tab interactive PTYs (`shell vim` and friends), which spawn through `PseudoterminalManager.openInlinePty` (`src/pseudoterminal-manager.ts:114`) and remain unrecorded.
- Remote-agent PTY sessions (`src/remote/pty-session.ts`), which run their own session on another host; this plan touches only the local `ssh <destination>` tab.
- Making the harness recorder's own write failures visible — it keeps failing silently (decision 5); only the swallowed-open-throw defect is fixed, since that one silently disables recording rather than merely failing quietly.

## Open questions

None.

## Verification

- `./scripts/run.mjs check-diff` after each step — lints the changed files, typechecks incrementally, and runs the related server tests.
- Manual check on a host with a reachable ssh destination (no test spawns a real ssh PTY): run `ssh <destination>` from the command bar, run a few commands on the remote host, resize the browser window mid-session, then log out so the tab closes. Confirm `.janissary/recordings/<host>-<timestamp>.cast` exists, that its first line is a valid `{"version":2,…}` header whose `command` is the full `ssh …` line you typed and whose `title` is the tab label, that an `"r"` event appears for the resize, and that `asciinema play` on the file replays the remote session with colors and timing. Confirm nothing you typed appears anywhere in the file.
- Manual negative checks: `ssh nonexistent-host-xyz` (the connection fails and the tab closes immediately) still leaves a `.cast` containing ssh's error output, since that output is printed before the process exits; and `ssh` with no destination returns the usage error and writes no file at all. Start `janus` normally and confirm the recordings directory is cleared; `janus --relaunch` and confirm prior recordings survive.
- Manual notification check: make `.janissary/recordings/` unwritable, open the notifications tab, then start an ssh session and confirm exactly one `ssh recording failed` line appears for that tab, that it appears even while the ssh tab is the active tab, and that the ssh session itself is unaffected.
