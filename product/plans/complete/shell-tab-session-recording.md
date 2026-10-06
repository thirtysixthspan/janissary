# Shell tab session recording, and a recording flag on every recorded tab

**Complexity: 7/10** — the recorder itself is reused verbatim, so nothing new is built to write a `.cast`, but the feature spans server and web with a new plugin declaration field, a new per-tab field on two view shapes, a new RPC wired through six places, a new metadata-row control on three kinds of tab, and a widened terminal-colour contract that runs from the stylesheet through the client's report to a recording header — and it opens with a forced extraction from `src/harness/manager.ts`, which has no line budget left to add to.

## Summary

Record a shell tab's PTY output to a replayable asciicast v3 `.cast` file, so a shell session's output survives after its tab closes; mark every tab that is recording with a flag in its metadata row that opens the recording when pressed; and carry the session's full 16-colour terminal palette into the recording header, which today records only a foreground and a background. The backlog entry reads verbatim: *"Recording a shell tab's session to an asciicast, similar to harness and ssh tabs."* The palette was added after a gap-research pass; see decision 13 and the Out of scope section for the seven sibling gaps that pass found and this plan declines.

The recording half is a widening of scope, not a new mechanism. `HarnessRecorder` (`src/harness/recorder.ts:20`) already records any PTY's timed byte stream to a `.cast` file: it subscribes to the `pty` bus channel, opens its append stream lazily on the first `data` event, writes a v3 header and `["o"|"r"|"x", …]` event lines, and disposes on exit or tab close. Named-harness tabs and ssh tabs both get one, through the two factories in `src/harness/observers.ts`. A shell tab is not recorded for one concrete reason: it is contributed by the bundled `shell` plugin, whose PTY is spawned inside a plugin payload factory (`src/plugins/shell/open-tab.ts:30` → `src/tab/openers.ts:63` → `src/tab/manager.ts:189` → `spawnPluginTerminal` → `PseudoterminalManager.spawn`), and that is a fourth spawn path with nothing on it that installs a recorder.

The flag half is a new, small surface. It reaches all three recorded kinds — harness, ssh and shell — because a recording nobody can find is worth much less than one they can: the flag shows that a tab is being recorded, and pressing it opens that recording in the asciicast player, following it live while the session runs.

Three things follow from the shell tab's spawn path, and they are the substance of the work:

1. A recorder has to be installed on a PTY that is spawned before its tab — and therefore its label — exists. `openPluginTab` mints the label and adopts the terminal onto it afterwards at `src/tab/openers.ts:142`, and both steps run in one synchronous span.
2. `liveRecordingPaths` (`src/plugins/live-recordings.ts:13`) skips any tab without a `harness` payload (`if (!tab.harness) continue;`), so a shell tab's recording would be reported finished in the asciicast player while it was still being written.
3. `HarnessManager.recordingPathOf` (`src/harness/manager.ts:69`) resolves a tab through `managers.tab.harnessTab(label)`, which a plugin tab is not.

## Design decisions

1. **Automatic for every shell tab, with no command, flag, or setting.** Every shell tab records from spawn to exit, matching the automatic scope already settled for named-harness tabs and ssh tabs — the backlog entry asks for recording "similar to harness and ssh tabs", and `product/specs/harness-recording.md` § Scope records that ssh recording is automatic for exactly the same reason. An opt-in trigger was considered and declined: a shell tab's command bar is the user's own shell, so a `record` command typed there would go to zsh rather than being routed, and the metadata-row affordance such a toggle would need is state the tab does not otherwise hold.

   **The privacy consequence, stated rather than inherited.** `harness-recording.md` § File format says keystrokes are never recorded, and that is true of the asciicast protocol here — `HarnessRecorder` writes no `"i"` events. It is not true in substance for a shell tab: zsh echoes every typed character back into the PTY, and that echo is part of the `"o"` byte stream the recorder writes. A `sudo` or `psql` password typed into a shell tab therefore lands in the `.cast` file through the terminal's own echo, where in an ssh tab the same secret would not. The accepted mitigations are the ones already true of every recording here: the file is written under the project's `.janissary/recordings/`, it is never served over the network or handed to a client, and the directory is cleared at a fresh launch. Nothing about the shell tab's own behavior changes — the recording is a passive observer of a byte stream that already exists.

2. **The header's `command` field carries the shell invocation.** A shell recording writes `/bin/zsh`, paralleling the ssh case (the verbatim `ssh …` invocation) and the harness case (the bare program name `claude`). That field is the per-kind discriminator in the shared recordings directory: `harness-recording.md` § File naming and lifecycle states that telling recordings apart means reading a file's header `command` or recognizing the tab label in its name. The tab label is already carried separately in the header's `title`, so putting it in `command` as well would duplicate it and read as an agent name rather than a program.

3. **The launch shell records on the same terms as any other shell tab.** `product/specs/shell-tab.md` describes the launch shell (`janus`, opened before any other tab exists, from no tab at all) as "an ordinary shell tab in every other respect", and it is opened through the same bundled plugin and the same `spawnTerminal` resource. It needs no special case, because — as decision 6's mechanism settles — the recorder is installed once the PTY has been adopted onto the label the host minted, and "from no tab at all" changes only which tab mints it.

4. **A write failure records one `shell recording failed` line and leaves the shell unaffected.** Mirrors the two existing precedents at `src/notifications/format.ts:67-68`: lower-case, article-free, tab label supplied by the notification header, fired at most once per tab, and listed in `EXPLICIT_EVENTS` (`src/notifications/index.ts:117-118`) so focus suppression cannot swallow it. The rationale is the one both precedents give: a silent gap is the single failure mode that defeats the point of an after-the-fact recording. The recorder keeps its non-fatal behavior — `abandon()` (`src/harness/recorder.ts:125`) destroys the stream and unsubscribes, and never touches the PTY.

5. **A recording flag, drawn as a flag, that is also the button that plays it.** Every tab of a recorded kind — harness, ssh, and shell — shows a `film` icon in its metadata row's flag cluster, with the tooltip and accessible name **recording** in every state. It is drawn the way the row's other flags are (`tabFlagDisplay` at `web/src/shared/tab/flag-display.ts:18`, or the shell plugin's own equivalent markup), and it is a control rather than a picture: pressing it opens the recording.

6. **Green and clickable from the same instant; plain and disabled before it.** The flag is green (`tab-flag--active`) exactly when it is pressable, which is exactly when the recorder has opened a file. Before that — a harness tab still provisioning a workspace, or any recorded tab that has printed nothing yet — the flag is drawn plain and cannot be pressed. One fact therefore decides both, so the row can never show a green flag that does nothing, and the client tracks one state rather than two.

   Drawn from the moment the tab opens, in all three cases. A harness tab opened with `-w` is a placeholder with no PTY until its clone lands (`HarnessView.status === 'provisioning'`), and `buildTabView` already handles exactly this for the provisioning flag at `src/tab/view.ts:147`; the recording flag follows the same rule — present early, honest about not yet recording.

7. **The flag survives the session's end.** When the PTY exits, `HarnessRuntimes` releases the runtime, disposing the recorder and dropping its path (`src/harness/runtime-registry.ts:24-31`). Left alone, that would make the flag vanish the instant a harness session ended, which contradicts the point: the file is on disk and is still worth replaying, and a partial file from a failed recording is the only artifact that session leaves. So the tab remembers its recording path once the recorder has opened one, and the flag stays and stays pressable. This is the one piece of genuinely new per-tab state the feature adds, and it belongs on the tab record rather than in a new map (architecture principle 2).

8. **One host-pushed `recording` path per tab, read by both metadata rows.** The host pushes one field carrying the recording's absolute path, and the harness/ssh row and the shell plugin's row both read that single field. Two shapes were considered and declined. A flag id in `TabView.flags` plus a separate path field would split one fact across two pushed values that can disagree, and the shell plugin has no route to `TabView.flags` at all — its row reads only its own payload and the client capabilities it is handed. A question the plugin pulls on demand adds no pushed state but cannot learn that the first output has landed without polling, and the flag has to appear the instant it does.

   It is the **path alone, not a `{ path, live }` pair.** Decision 6 makes the flag green exactly when it is pressable and pressable exactly when this field is present, so a liveness flag beside it would be a second copy of the same fact that could disagree with the first — and nothing reads it. The client never needs to know whether a recording is live: the asciicast plugin's inline opener already computes `finished: !capabilities.isRecordingLive(path)` server-side, and `isRecordingLive` (`src/plugins/live-recordings.ts`) is the server's own answer for exactly that question. If a finished-versus-recording treatment is ever wanted, that is the accessor to grow, not a field pushed to every client on every broadcast.

9. **Pressing the flag opens the recording in the asciicast player tab.** Exactly what `open <file>.cast` does today: the asciicast plugin's inline opener (`src/plugins/asciicast/activate.ts:40`), which sets `finished: !capabilities.isRecordingLive(path)` — so pressing the flag on a live session opens a player that follows it, and on a finished one opens a player that does not. No new player, no new command, and no new retrieval surface: `play <label>` already resolves the newest `<label>-<stamp>.cast` (`src/play/run.ts`, `src/play/recording-search.ts`), and that keeps working unchanged for all three kinds.

10. **The trigger is a new label-keyed RPC, following the metadata-row RPCs that already exist.** `openTranscriptFor`, `openHarnessTranscriptFor` and `launchAgentFor` (`src/protocol/core-rpc.ts`) are all "a button in a tab's metadata row asked for something by label", and `web/src/shared/agent-tab-intents.ts` is the client-side helper that builds them. The recording flag follows that shape exactly rather than routing a command line, so the shell plugin gets it as a client capability beside `openFileNavigator` and `launchAgentHere` (`web/src/plugins/api.ts:281`) rather than through an intent.

11. **A shell recording carries the session's terminal colours.** The v3 header can carry `term.theme`, and only the harness terminal reports its resolved foreground and background today — the shell plugin builds its own xterm (`web/src/plugins/shell/useShellTerminal.ts:91`) and never reports. The shell plugin reports them once its terminal mounts, through the existing `reportTerminalColors` RPC, which reaches `HarnessManager.reportTerminalColors` → `runtimes.get(id)?.recorder?.setColors(...)` (`src/harness/manager.ts:79`). **No server change is needed for this**: the shell's recorder goes into the same `HarnessRuntimes` registry keyed by PTY id, so the existing lookup already finds it. Without it a shell recording would play back in a different palette from the session that produced it, and decision 5 now advertises these files to the user.

12. **Inherited unchanged from `harness-recording`** — the v3 format, the shared `.janissary/recordings/` directory, the `<label>-<timestamp>.cast` naming from `harnessArtifactFilename` (`src/harness/artifact-name.ts`), lazy creation on first output, clear at a fresh launch and preserve across `--relaunch`, and the output-and-resize-only event set. None of this is chosen afresh; the plan widens the scope of recording rather than adding a mechanism.

13. **The recording header carries the full 16-colour palette, and the app gains the palette to record.** Added after a gap-research pass, which found that asciicast v3's `term.theme` is `{ fg, bg, palette }` with **all three required** ([spec](https://docs.asciinema.org/manual/asciicast/v3)) while Janissary records only `fg` and `bg`. So a recording whose output used the 16 ANSI colours replays in whatever palette the viewer has, not the session's.

    The finding that shapes the work: **the application has no palette to record.** Its stylesheet declares only `--terminal-fg` and `--terminal-bg` per theme (`web/src/theme.css:20-21` and each `[data-theme]` block), and every terminal is constructed with `theme: { background, foreground }` alone (`web/src/shared/terminal/useXterm.ts:52`) or background/foreground/cursor/selection (`web/src/plugins/shell/shell-terminal-theme.ts:18`). The 14 remaining ANSI colours on screen today are **xterm.js's built-in defaults** — the Tango palette: `#2e3436 #cc0000 #4e9a06 #c4a000 #3465a4 #75507b #06989a #d3d7cf #555753 #ef2929 #8ae234 #fce94f #729fcf #ad7fa8 #34e2e2 #eeeeec` (`DEFAULT_ANSI_COLORS` in `node_modules/@xterm/xterm/lib/xterm.js`). They are the same on every theme, so recording them buys little on their own.

    **This reverses a decision the codebase already made on purpose, and the plan replaces that reasoning rather than routing around it.** `src/harness/cast-header.ts` says so in its own header comment: *"`theme` carries only the two colors this app themes — the 16 ANSI colors are xterm's built-in constant and are identical on every recording this makes, so there is no palette to record and an incomplete theme is deliberate."* That was a reasonable call when the palette was xterm's constant and nothing else. Two things have changed. The format it writes is specified, and the spec marks `fg`, `bg` **and `palette` all required** — so "incomplete, deliberately" is a header this app knows to be wrong, written into a file whose whole value is being replayable elsewhere. And the palette is no longer a constant, because this plan gives the app somewhere to put a real one. **The comment is deleted, not amended into vagueness**, and what replaces it states the two new facts: the palette is what the stylesheet resolves, and it defaults to xterm's values until a theme says otherwise.

    Recording them is the decision, then, for three reasons. It makes the header conform to the format it claims to be, which matters for a file meant to be replayed by `asciinema play` and other players rather than only by this one. It is the enabling step for the real prize: the moment any theme picks its own palette, recordings carry it with nothing else changing. And it costs one block of custom properties.

    **The values are declared once at the document root**, defaulted to xterm.js's list, rather than repeated in every theme block as `--terminal-fg` and `--terminal-bg` are — a theme that later wants its own colours overrides them in its own block and nothing else moves. Sixteen identical lines per theme would be noise, and a theme that forgot one would silently get a different colour with nothing to show for it.

    **They are read from the stylesheet, not queried from the terminal.** The asciicast v3 spec notes that `asciinema rec` obtains the theme by querying the terminal with OSC sequences. That is the more faithful technique and it is deliberately not used here: the header is written lazily on the first `data` event (`src/harness/recorder.ts:96`), an OSC round-trip's answer may not have arrived by then, and a header already written can never be amended. The report-before-first-output arrangement that makes `fg` and `bg` work today (`web/src/shared/terminal/useXterm.ts:134`) is the arrangement the palette joins.

    **The palette widens `terminalColors()` rather than joining it as a second function.** Three of its four callers want the whole object and the fourth (`shellTerminalTheme`, which uses the result as a fallback for `fg`/`bg` only) costs nothing by ignoring a field; a separate `terminalPalette()` would need a second `getComputedStyle` pass and would split one terminal-colour contract into two shapes that could disagree.

## What already exists (reuse, don't rebuild)

| Piece | Where |
| --- | --- |
| `HarnessRecorder` — the v3 recorder, verbatim: lazy open on first output, `"o"`/`"r"`/`"x"` events, stream-`'error'` self-disable, 4 MiB pending cap | `src/harness/recorder.ts:20` |
| `sshRuntime` — the precedent factory: a recorder alone, no screen reader, no transcript source or tailer, one failure notification | `src/harness/observers.ts:63` |
| `HarnessRuntime` — already takes an optional recorder as its second constructor parameter and disposes it with everything else | `src/harness/runtime.ts:19` |
| `HarnessRuntimes` — per-PTY-id registry keyed by id, recorded beside the owning label; releases on `pty`/`exit` or `closeTab(label)` | `src/harness/runtime-registry.ts:13` |
| Recording directory init / path builder / clear, already wired at both ends — nothing to add under decision 12 | `src/harness/recording-file.ts`, registered at `src/state-dirs.ts:33` |
| `<sanitized-label>-<ISO-timestamp>.cast` filename builder | `src/harness/artifact-name.ts` |
| The `pty` bus channel — `data`, `exit`, `resize` — every observer subscribes to | `src/bus.ts:121` |
| `MANAGER_TAB_RELEASE` already lists `harness`, so a shell tab's close reaches `managers.harness.closeTab(label)` and so `runtimes.closeTab(label)` | `src/managers.ts:135` |
| `reportTerminalColors` — the whole RPC and its six-place wiring; decision 11 needs only the client half | `src/protocol/core-rpc.ts:42`, `src/client-message.ts:73`, `src/client-params/core.ts:48`, `src/message/handler.ts:72`, `src/controller/tab-adapter.ts:48` |
| `notify`, plus the `ssh-recording-failed` / `harness-recording-failed` kinds and their `EXPLICIT_EVENTS` entries — the pattern to copy | `src/notifications/index.ts:60,106`, `src/notifications/format.ts:67` |
| The `play` command, `playablePluginForExtension`, and the asciicast plugin's inline opener and `liveness` intent — decision 9 rides all of it | `src/play/run.ts`, `src/openers/index.ts`, `src/plugins/asciicast/activate.ts` |
| `recordedByName` — resolves `play <name>` by scanning the recordings directory for the newest `<stem>-<stamp>.cast`. It reads the directory directly, **not** through `recordingPathOf`, so a shell recording is reachable by `play` with no change at all | `src/play/run.ts:63`, `src/play/recording-search.ts` |
| `faFilm` in `@fortawesome/free-solid-svg-icons` — already installed; the flag needs no new dependency | `web/src/shared/icons.ts:38` |
| `validateCommandBarClaim` — the activation-time check a declaration-shape guard copies | `src/plugins/activate.ts:50` |
| `managers.plugins.declarations.find(...)` — the existing declaration lookup, and the pattern the new recording lookup in `buildTabViews` follows | `src/tab/view.ts:29` |
| `writeHarnessEntry`'s explicit field list, and `harnessProblems`' closed field list — **why adding a field to `HarnessView` cannot leak into a saved profile** and needs no profile-schema change | `src/profile/save/entries.ts:67`, `src/profile/schema-tab-entry.ts:43` |
| The label-keyed metadata-row RPCs and `agentTabIntents` — decision 10's shape to copy | `src/protocol/core-rpc.ts`, `web/src/shared/agent-tab-intents.ts` |
| `AgentTabMeta`'s flag cluster and `tabFlagDisplay`; `ShellTabMeta`'s hand-written equivalent | `web/src/shared/AgentTabMeta.tsx:73`, `web/src/shared/tab/flag-display.ts:18`, `web/src/plugins/shell/ShellTabMeta.tsx:16` |
| `terminalColors`, already re-exported to plugins on the client api barrel — the shell plugin reads its own colours with it, as `shell-terminal-theme.ts:1` already does | `web/src/plugins/api.ts:51`, `web/src/plugins/shell/shell-terminal-theme.ts` |
| `ownsTerminal` — the existing shared predicate for "this plugin tab owns a live terminal" | `src/tab/plugin-terminals.ts:17` |
| The real-temp-dir, poll-the-`.cast`-file recorder test harness, with no `node:fs` mocking | `src/harness/recorder.test.ts` |
| `castHeader` — the v3 header builder, which already takes `colors` and is the only place a palette field has to be added | `src/harness/cast-header.ts` |
| `TerminalColors` and its ingress validator, on both sides — the two files a palette is threaded through | `src/harness/terminal-colors.ts`, `web/src/shared/terminal/colors.ts` |
| xterm.js's `DEFAULT_ANSI_COLORS` — the 16 values the new custom properties default to, read from the installed package rather than retyped from memory | `node_modules/@xterm/xterm/lib/xterm.js` |
| `--terminal-fg` / `--terminal-bg` in every `[data-theme]` block, and the `:root` default they already fall back to | `web/src/theme.css:20-21` |

## Proposed changes

Prose only. Names are contracts, not code.

### `src/plugins/api.ts`, `src/plugins/activate.ts`, and the shell manifest — a declared opt-in

Add an optional `recordsTerminal?: boolean` to `TabPluginDeclaration`, beside `spawnTerminal?: boolean` and for the same reason: starting a process and writing its output to disk are the two most powerful things a plugin can ask for, and both belong in the declaration a reader reviews rather than arriving ambient.

It implies `spawnTerminal`, so a declaration carrying it without the other is refused at activation, in the shape of `validateCommandBarClaim` (`src/plugins/activate.ts:50`): a small sibling validator beside `chordIdPattern`, throwing before anything is offered. That guard is not decoration — without `spawnTerminal` there is no terminal for the claim to mean anything about, and the plugin would silently get no recording while its declaration said it had one.

Add `recordsTerminal: true` to `shellManifest` (`src/plugins/shell/manifest.ts`). It is the only bundled declaration that carries it, which is how decision 8's scope boundary — shell tabs and nothing else — is enforced by the declaration rather than by a plugin-id check in host code.

### `src/harness/observers.ts` — a third factory

Add `shellRuntime(managers, id, label, command)` beside `harnessRuntime` and `sshRuntime`. It builds a `HarnessRecorder` over the PTY id with the label, `/bin/zsh` as the header command, spawn dimensions from `managers.pty.spawnDimensions()`, and a failure callback firing `shell-recording-failed`. It constructs **no** screen reader and **no** transcript source or tailer, exactly as `sshRuntime` does — which is what keeps a shell tab invisible to the monitor feeds (`harnessFeedEntries` skips any tab whose `view` is not `'harness'`, `src/monitor/harness-feed.ts:41`) and keeps the change free of the capture wiring that is harness-specific.

`src/harness/manager.ts` gains `registerShellObservers(id, label)` beside `registerSshObservers` (`src/harness/manager.ts:88`), installing the runtime under the PTY id and the tab label. **This file is 199 raw lines against a limit of 200 *counted* lines, with blanks and comments skipped** — measure it before editing rather than trusting either number. Nothing can be added until something comes out; the same forced extraction the ssh plan performed, done first and as its own green checkpoint. Follow the precedent that module's own comment describes: the manager decides *that* a PTY gets observers, not what they are (`src/harness/observers.ts:13-16`). A sibling in `src/harness/` exporting plain functions, holding no state, is the shape.

### `src/tab/openers.ts` and `src/tab/manager.ts` — install the recorder after adoption

`openPluginTab` already adopts every terminal the factory started onto the label `addPluginTab` minted, in the `afterApply` callback at `src/tab/openers.ts:142`. That is where the shell recorder goes: after `adoptTerminal`, for each adopted id, when the plugin's declaration carries `recordsTerminal`.

**How the step reaches the harness manager.** `openPluginTab`'s `OpenTarget` is a deliberately structural interface that avoids importing `TabManager` so the module has no cycle back to it (`src/tab/openers.ts:15`). So the step is a new `OpenTarget` method beside `adoptTerminal`/`killTerminal`, implemented on `TabManager` (which holds `this.managers`) and delegating to `managers.harness`. The declaration test belongs on that `TabManager` side too, resolved through `managers.plugins.declarations.find(...)` exactly as `buildTabViews` already does (`src/tab/view.ts:29`) — not as a plugin-id comparison in `openers.ts`.

**Why after adoption and not at spawn.** The label does not exist when the PTY is spawned, and it is the label that names the recording (`harnessRecordingPath(label, startedAt)`) and that the tab-close release matches on (`HarnessRuntimes.closeTab` compares `entry.label`, `src/harness/runtime-registry.ts:46`). Installing after adoption means the registry entry is correct from the first moment and nothing has to be mutated later. Nothing can be missed in the gap: `openPluginTab` runs `withResources`, `addPluginTab`, `applyOpenResult` and the adoption callback without yielding, and PTY output reaches `messageBus.emit('pty', …)` from node-pty's read callback, which is always a later turn of the event loop.

`updatePluginTab` (`src/tab/openers.ts:177`) adopts the same way for a tab updated in place, and takes the same step for a terminal its factory spawns — `withResources` hands it `spawnTerminal` too, so a plugin *can* start a terminal from an update. The shell plugin does not do so today, but the declaration is the contract and the step is the same line in the same place; leaving it out would make `recordsTerminal` mean one thing on open and nothing on update.

`openPluginTab` is 213 raw lines against the same 200 counted limit; measure it before editing and extract the recording step into a sibling module under `src/tab/` if it does not fit. Do not compact it to fit.

### `src/tab/types.ts`, `src/tab/view.ts`, `src/protocol/` — the pushed field

Add an optional `recording?: string` — the absolute `.cast` path — to `HarnessView` (`src/tab/types.ts:56`) and to `PluginTabView` (`src/protocol/plugin.ts`), and build it in `buildTabView` (`src/tab/view.ts:51`) from a new per-label lookup callback in the shape of the `workspaceOf` / `reconnectingOf` / `declarationOf` parameters it already takes (`src/tab/view.ts:70-71`), fed from `buildTabViews` (`src/tab/view.ts:8`) alongside the ones already there. Never from a new map on a manager (architecture principle 2).

The tab record carries the remembered path so the field survives the runtime's release on exit (decision 7). The field is absent for a tab with no recorder at all and for a recorder that has opened no file, which is what makes decision 6's disabled state expressible without a second field: presence *is* the state.

Two consequences to know rather than rediscover:

- **Nothing leaks into a saved profile.** `writeHarnessEntry` (`src/profile/save/entries.ts:67`) builds its entry from an explicit field list rather than spreading the view, and `harnessProblems` (`src/profile/schema-tab-entry.ts:43`) validates a closed field list, so a profile neither gains a key nor rejects one.
- **The shell payload's schema does not move.** `SHELL_PAYLOAD_SCHEMA_VERSION` stays at 2 and `isShellPayload` is unchanged, because the field is host-computed rather than plugin-authored. The shell plugin's row learns it from the client capabilities, not from its payload — which is the point of decision 8.

### `src/plugins/live-recordings.ts` and `recordingPathOf` — reaching a plugin tab

`liveRecordingPaths` walks `managers.tab.tabs` and skips any tab without `tab.harness` (`src/plugins/live-recordings.ts:13`), which would mark a live shell recording finished. Widen it to ask the host for each tab's recording rather than assuming the harness-view shape.

`HarnessManager.recordingPathOf` resolves through `managers.tab.harnessTab(label)`. Give it the plugin-view branch as well, so a shell tab's recording is reachable by label. Two readers depend on that: `liveRecordingPaths`, and the new RPC. (`play` does **not** — `recordedByName` scans the directory instead, `src/play/run.ts:63`.)

### A new label-keyed RPC

`openRecordingFor: { label: string }`, following `openTranscriptFor` and `openHarnessTranscriptFor` at `src/protocol/core-rpc.ts`. It resolves the named tab's recording path and runs the asciicast plugin's inline opener on it, so pressing the flag opens the player — live-following or not, decided server-side by the opener's own `finished: !capabilities.isRecordingLive(path)`, which is why the client never had to know. It no-ops when the tab is missing or has no recording path yet, which is what makes the disabled flag state coherent rather than a click that silently does nothing.

**Why not the generic `command` RPC**, which could dispatch `open <path>` and needs no new server surface at all: `web/src/plugins/api.ts:214-218` records the codebase's own reasoning for these being tab-scoped RPCs rather than command lines — the flag's action belongs to *this* tab and is not the same thing as a command run in it — and a dispatched line is appended to the tab's transcript, which a harness tab does not even render. Adding the method to the shared `TranscriptMethod` union in `web/src/shared/agent-tab-intents.ts:7` is part of the client change; if that union's name stops describing its contents once a third method joins it, rename it rather than leaving a misnomer.

Six places, as every RPC needs: the `CoreRpcCall` arm, `CLIENT_METHOD_CONTRACTS` in `src/client-message.ts` (an `ack`, like its two siblings), the param guard in `src/client-params/core.ts`, a `case` in `src/message/handler.ts` (there is an exhaustiveness test at `src/message/handler-exhaustive.test.ts`), the controller method and its `Managers` lookup in `src/controller/tab-adapter.ts`, and the client call.

### Client

- `web/src/shared/icons.ts` — export `faFilm` as `recordingIcon`, in the `@fortawesome/free-solid-svg-icons` block already there (`:38`). Already installed; nothing is added.
- **`web/src/shared/tab/flag-display.ts` — the flag is defined once, here, and both rows render it.** This is the one place the flag must not be written twice. The recording entry joins `tabFlagDisplay` (`:18`) beside `workspaced`, `autoApprove` and `browser`, carrying its icon, its **recording** label, and the `tab-flag--active` class — and a marker saying the flag is pressable, so `AgentTabMeta`'s cluster knows to render it as a `<button>` rather than the plain `<span role="img">` every other flag uses. The click handler itself stays out of the shared table (a shared module holds no per-tab callbacks) and arrives as a prop beside `onOpenTranscript`. Because `ShellTabMeta` deliberately does not import `AgentTabMeta`'s markup and must keep that independence, re-export `tabFlagDisplay` and `recordingIcon` through the plugin api barrel beside the existing `terminalColors` re-export (`web/src/plugins/api.ts:51`), so the shell row renders the same definition from `capabilities` rather than hand-rolling a fourth copy of a flag. The shell plugin already imports across the `shared → feature` boundary this way (`shell-terminal-theme.ts:1`), so nothing new is introduced.
- `web/src/harness/HarnessTab.tsx` — passes the tab's `recording` down and wires the click through `agentTabIntents` (`web/src/shared/agent-tab-intents.ts`), beside `onOpenTranscript`. Harness and ssh tabs share this row, so one change covers both.
- `web/src/plugins/api.ts` — add `recording?: string` and `openRecording?()` to `TabPluginClientCapabilities`, built in `createPluginClientCapabilities` from the tab's pushed view. Optional, like `attachTerminal` and `openFileNavigator`, so the plugin fixtures that build this object are not churned.
- `web/src/plugins/shell/ShellTabMeta.tsx` — draws the flag from `capabilities.recording` through the shared `tabFlagDisplay` entry above, using the same class names as the row it already duplicates from `AgentTabMeta`. The flag and its pressed/disabled split is a self-contained concern, so extract it into its own module under `web/src/plugins/shell/` rather than growing the component (per `ai/guidelines/react-code-organization.md`).
- `web/src/plugins/shell/useShellTerminal.ts` — report the resolved foreground and background once after the terminal mounts, mirroring the effect at `web/src/shared/terminal/useXterm.ts:134`. It builds its own `new Terminal(...)` at `:91` rather than using the shared hook, so it has no `reportColors` action today; `terminalColors` is already re-exported to plugins at `web/src/plugins/api.ts:51`, so only the reporting effect and its `client` handle are new.

### The 16-colour palette (decision 13)

One value travels the whole way from the stylesheet to the header, and every step of that path already exists for `fg` and `bg`. Nothing new is invented; the chain is widened once.

- **`web/src/theme.css`** — declare `--terminal-black` through `--terminal-bright-white` **once, at the document root**, carrying xterm.js's `DEFAULT_ANSI_COLORS` values as the fallbacks, above where `--terminal-fg` / `--terminal-bg` are already defaulted. No `[data-theme]` block is edited; a theme overrides what it wants in its own block.
- **`web/src/shared/terminal/colors.ts`** — `terminalColors()` grows a `palette` field: sixteen named colours read from those custom properties in the same `getComputedStyle` pass, in the fixed ANSI order, each falling back to its root default exactly as `fg` and `bg` do today. The `TerminalColors` type widens to match.
- **`src/harness/terminal-colors.ts`** — `TerminalColors` widens the same way and `isTerminalColors` validates it. **The palette is optional in the validator**, so a client that predates this change still passes and still records `fg`/`bg`; a client that sends a palette has all sixteen checked by the existing `isHexColor` (`src/harness/terminal-colors.ts:21`), because this is untrusted input headed straight into a recording header. A palette of the wrong length is refused, not padded or truncated.
- **`src/protocol/core-rpc.ts`**, **`src/client-params/core.ts`**, **`src/controller/tab-adapter.ts`** — the `reportTerminalColors` params gain the optional palette and pass it through. The param guard widens with the type; no new RPC.
- **`src/harness/cast-header.ts`** — writes `term.theme.palette` as the colon-joined `#rrggbb` list the spec shows, and **omits the key entirely when no palette was reported**, so a recording made without one keeps exactly today's header rather than a malformed theme object. (The spec marks all three theme attributes required; omitting the key is the graceful reading of that, and a player already tolerates a theme without a palette — the current one.) **The module's header comment is replaced, not amended** — see decision 13, which explains in place why its "there is no palette to record" reasoning no longer holds.
- **`web/src/plugins/asciicast/useAsciicastTerminal.ts`** — the player applies the palette. It reads `header.colors ?? terminalColors()` (`:41`) and builds `theme: { background, foreground }` from the result; it now passes the sixteen colours through too, **merging per field rather than replacing wholesale**, so a recording whose header carries only `fg` and `bg` still plays with the viewer's own palette for the rest — which is exactly today's behaviour and the regression guard for old files.
- **`web/src/shared/terminal/useXterm.ts`** — the reporting effect destructures `{ fg, bg }` at `:136`; it now reports the palette as well, which is what makes every harness and ssh recording carry one. No other change: the `theme` it builds at `:52` still needs only `fg` and `bg`.

  **One trap, named because it is easy to ship by accident.** `useAsciicastTerminal.ts:41` calls its local variable `palette` for the whole `{ fg, bg }` object, so the moment a real `palette` field exists inside that object the line reads `palette.palette`. Rename the local (`recording` or `colors`) in the same edit — a `palette.palette` in the player is the kind of thing that survives review because it compiles.

### `src/notifications/` — a shell recording-failure kind

Add `'shell-recording-failed'` to `NotificationEventType` (`src/notifications/index.ts:60`), to `EXPLICIT_EVENTS` (`:117`), and a `notificationText` case returning `shell recording failed` beside `case 'ssh-recording-failed'` (`src/notifications/format.ts:67`). Standalone and inert until the factory in `src/harness/observers.ts` fires it.

### Specs and documentation

- **`product/specs/harness-recording.md`** — § Scope gains shell tabs. Its last sentence ("Inline / full-tab interactive PTYs (e.g. `shell vim`) get neither observer and are **not** recorded") is the trap here: a shell *tab* is a full-tab interactive PTY as far as that sentence reads, so it needs disambiguating, not just extending — the exclusion means a PTY spawned by the `shell` command through `openInlinePty` (`src/pseudoterminal-manager.ts:192`), not a tab whose body is a terminal. § File format gains the palette in the `term.theme` description: that all three keys are written, **that the values are resolved from the application's stylesheet rather than queried from the terminal, and why** (the header is written on the first output and cannot be amended afterwards), and that the sixteen default to xterm.js's palette until a theme overrides them. Stating it in the spec as well as in the code is deliberate: the module this plan overturns argued the opposite in a comment, so a reader who finds that reasoning in history should find the answer in the spec rather than have to reconstruct it. A new section covers the flag: which tabs carry it, its plain-until-clickable rule, that it survives the session's end, and that pressing it opens the player and follows a live recording.
- **`product/specs/shell-tab.md`** — a "Session recording" section: automatic for every shell tab including the launch shell, `.janissary/recordings/`, output and resize only, created lazily on first output, closed when the PTY exits or the tab closes, cleared at a fresh launch and preserved across `--relaunch`, one `shell recording failed` line on a write failure — and the keystroke-echo consequence of decision 1 stated in the spec rather than left to the code. Its § The metadata row enumerates the tab's actions ("open file navigator here", "new shell here", the split control, and the connections and schedule windows) and gains the recording flag. Its § Everything else says the tab is "live and in-memory, never persisted", which the recording does not contradict — the bytes are on disk, the tab is not.
- **`product/specs/ssh-tab.md`** § Session recording gains the flag, alongside the existing automatic-recording text.
- **`product/specs/harness.md`** — the metadata row and the lifecycle sections gain the flag; the screen-capture / transcript / recording distinction is unaffected.
- **`product/specs/tabs.md`** — the metadata-row section's flag list gains the recording flag's states.
- **`product/specs/tab-plugins.md`** — § Bundled shell plugin notes that it asks for `recordsTerminal`; the declaration field itself is documented beside `spawnTerminal`.
- **`documentation/user-documentation/advanced-agents/harness.md`** — the Recordings section, which currently names only harness and SSH tabs.
- **`documentation/user-documentation/tab-types/recording-player.md`** — the shell tab joins the tab kinds that record, and the flag is how a recording is reached from the tab that made it.
- **`help.md` needs no change.** Its `play` row (`help.md:23`) describes `play <name>` by what the name resolves to — "plays the newest `.cast` recording of the session named `devbox`" — and never enumerates which tab kinds record, so a shell recording is already covered by the text as written. Verified rather than assumed; do not add a tab-kind list to it.

### Deliberate limits, named rather than silent

- The remembered recording path on the tab is never cleared while the tab lives. It is one string per tab and costs nothing at this scale; the upgrade, if a tab were ever held open across many sessions, is to keep the newest per-session value rather than the first.
- The pushed `recording` field is recomputed on every state broadcast, which is one registry lookup per tab per broadcast. That is free at the local scale this app is built for (architecture principle 8 notes the same tradeoff for `emitState` as a whole); the upgrade is a per-tab event carrying the transition rather than a field rebuilt in the snapshot.
- A flag's liveness is not pushed to the client at all (decision 8). The ceiling: a future "finished" treatment on the flag would need the server's `isRecordingLive` answer in the pushed field too, growing it from a string to a pair — accepted now as a change nobody has asked for.
- The 16 recorded palette colours are xterm.js's defaults, not an app theme's (decision 13). The ceiling is deliberate and named rather than hidden: this makes the header conform and makes a themed palette possible, and it does not by itself make recordings *look* like the session until someone picks a palette for a theme. The upgrade path is the Out-of-scope entry for a real per-theme palette.
- `live` goes false one microtask *after* the PTY's exit event, because `HarnessRuntimes` defers its release until the dispatch finishes so the exit status still reaches the file (`src/harness/runtime-registry.ts:24-31`). A player following a session therefore keeps following for that one turn. Accepted rather than worked around: releasing earlier would drop the exit status from the recording, which is worth more than a turn of a stale live answer.

### Implementation order

Each step should leave typecheck and tests green on its own.

1. The forced extraction out of `src/harness/manager.ts`, as its own green checkpoint, before anything is added to it.
2. The palette end to end — stylesheet variables, `terminalColors()`, `TerminalColors` and `isTerminalColors`, the `reportTerminalColors` params and guard, `castHeader`, and the player. **This is independent of everything else below** and is a good second step: it is a self-contained contract change with no dependency on the shell recorder, and it improves harness and ssh recordings on its own.
3. The `shell-recording-failed` notification kind — standalone and inert until step 6 fires it.
4. The `recording` path field on `Tab`, `HarnessView` and `PluginTabView`, built in `buildTabView`, with the test assertions that it is absent with no recorder and present once a path exists.
5. `shellRuntime`, `registerShellObservers`, and `recordsTerminal` on the declaration and the shell manifest — the recorder works but nothing installs it yet.
6. The installation in `openPluginTab` / `updatePluginTab`, plus the `liveRecordingPaths` and `recordingPathOf` widenings, which are what make the recording reachable and correctly live.
7. The `openRecordingFor` RPC and its six places.
8. The client: the `film` icon, the `tabFlagDisplay` entry, both metadata rows, the client capability, and the shell terminal's colour report.
9. Specs and documentation.

Steps 2, 3 and 4 are independent of each other and of step 1. Step 8's two halves — the harness row and the shell plugin's — are independent of each other too.

### Implementation notes — decisions taken while building

Recorded here because each is a place the implementation settled the plan's mechanism more narrowly
than the plan named it, and an implementer reading only the plan would otherwise expect the wider
shape.

1. **The pushed field is read straight off the tab, not through a per-label lookup callback.** The
   plan proposed a new `recordingOf` callback in the shape of `workspaceOf` / `reconnectingOf`.
   `buildTabView` is already handed the `Tab`, so `tab.recording` is right there; a callback would
   have been a second route to a field the function holds. Dropped, and one fewer parameter on a
   function that takes nine.

2. **`HarnessRecorder` gained an `onOpened` callback, carrying the path.** This is how `tab.recording`
   is ever written: the path exists only inside the recorder's `open()`, and the recorder is released
   on the PTY's exit, so something has to hand it out while it is still there. It is the same wiring
   the `onFailure` callback already uses, and it fires once, after the header line is written so a
   listener that opens the file finds a complete one. The recorder's behavior is otherwise unchanged.

3. **`recordingPathOf` and `liveRecordingPathOf` are two questions, not one.** The plan folded them.
   They cannot be: the flag needs the tab's remembered path (which outlives the process) while
   `liveRecordingPaths` needs the recorder's live one (which does not), and answering the second with
   the first would report a finished recording as live. `recordingOf` reads the tab; `liveRecordingOf`
   reaches the PTY — through `tab.harness?.ptyId` or, for a plugin tab, `managers.pty.terminalIdFor`,
   the same rule `ownsTerminal` already shares with `send`, `queue` and `schedule`.

4. **`AgentTabMeta` takes `hasRecorder` and `onOpenRecording` separately.** The plan said "one field".
   One field cannot express the two states the row has to distinguish: a `-w` harness tab still
   provisioning records but has no file yet, and an agent tab does not record at all. The first prop
   says the tab kind records; the second says there is something to open. Absence of the second is
   also what makes the flag a non-interactive `span` rather than a focusable dead button.

5. **The recording flag is its own component on the host side too** (`web/src/shared/RecordingFlag.tsx`),
   not only inside the plugin. Both rows need the same "button when pressable, inert `span` when not"
   rule, and the plan's rationale for the plugin's independence from `AgentTabMeta` applies to the
   markup, not to the logic.

6. **`liveRecordingPaths` iterates every tab.** The plan said to widen the `if (!tab.harness) continue`
   skip; iterating every tab and asking the host per label is the same thing without a special case,
   and it is what makes a plugin tab's recording report live.

## Tests

**Server**, colocated as `src/**/*.test.ts` in vitest project `server`:

- **`src/harness/recorder.test.ts`** (extend, reusing its real-temp-directory and poll-the-file helpers, keeping its no-`fs`-mock style): the header's `command` is `/bin/zsh` when the shell factory builds it, and `title` is the tab label; `term.theme.palette` is the colon-joined list when a palette was reported and the key is **absent** when none was, so an old client's recording keeps today's header. Nothing else changes about the writer — `HarnessRecorder` itself is untouched.
- **`src/harness/terminal-colors.test.ts`** (new): `isTerminalColors` still accepts a bare `{fg, bg}`, accepts a well-formed sixteen-colour palette, and refuses a palette of the wrong length, a non-hex entry, and a non-array value. This is the trust boundary for a value that lands in a file header, so the refusals are the substance of the test.
- **`src/harness/cast-header.test.ts`** (new): the palette is joined in ANSI order with the `:` separator the spec shows, omitted when absent, and the `term.theme` object carries all three keys when all three are known.
- **`src/harness/manager.test.ts`**: `registerShellObservers` installs a runtime holding a recorder and no tailer, and `transcriptTailer(label)` still returns `undefined` for the tab — that accessor is what keeps a shell tab out of the monitor transcript feed (`if (!tailer) continue`, `src/monitor/harness-transcript-feed.ts`), and it must not start returning one. A `pty`/`exit` for that id disposes the runtime and drops it from the registry.
- **`src/tab/`**: opening a shell tab through the real `openPluginTab` path installs a recorder whose recording path is named after the **minted** label, not the stand-in the PTY was spawned under — the assertion that pins decision 6's placement. A plugin whose declaration does not carry `recordsTerminal` gets none, and a terminal spawned from an `updatePluginTab` factory gets one. A declaration carrying `recordsTerminal` without `spawnTerminal` is refused at activation.
- **`src/tab/view.test.ts`**: the pushed `recording` field is absent for a tab with no recorder, present once a path exists, and still present — pointing at the same file — after the runtime is released on exit. That last one is the assertion that pins decision 7, and absence-is-the-only-disabled-state is what pins decision 6.
- **`src/plugins/live-recordings.ts`**: a plugin tab's live recording is reported, which is the regression guard for the `if (!tab.harness) continue` skip; a tab with no recording contributes nothing.
- **`src/notifications/index.test.ts`**: `notificationText('shell-recording-failed', …)` returns the exact string, and `shouldNotify` returns true for it even when the tab is active and every ambient toggle is off — matching the existing `ssh-recording-failed` assertions at `src/notifications/index.test.ts:176`.
- **`src/message/handler-exhaustive.test.ts`** already guards the new RPC's `case`; confirm it passes.

**Web**, colocated as `web/src/**/*.test.ts(x)` in vitest project `client`:

- **`web/src/shared/AgentTabMeta.test.tsx`** (exists; extend it): the flag is drawn when the tab has a recording and is a pressable button; it is drawn but not pressable when there is none; it carries `tab-flag--active` exactly when pressable; its tooltip and accessible name are **recording** in both states; pressing it calls the handler.
- **A new test file for the extracted shell flag module** under `web/src/plugins/shell/`. There is no `ShellTabMeta.test.tsx` today and this plan does not add one for `ShellTabMeta` itself — the plugin's tests are one per module (`ShellTab.test.tsx`, `useShellTerminal.test.ts`, `shell-terminal-theme.test.ts`, and a dozen `shell-*.test.ts`), so the flag is tested where it lives, beside its sibling `shell-terminal-theme.test.ts` in shape.
- **`web/src/plugins/shell/useShellTerminal.test.ts`** (exists; extend it): the terminal reports its resolved colours once for its `ptyId` after mounting, and does not report again on a re-render. The reported palette carries all sixteen colours in ANSI order.
- **`web/src/shared/terminal/colors.test.ts`** (new): the sixteen properties are read in ANSI order, each falling back to its root default when a theme overrides or omits it, so a theme that sets only some of them still yields a complete palette.
- **The asciicast player** (`web/src/plugins/asciicast/`): a recording whose header carries a palette plays with it, and one carrying only `fg`/`bg` — every recording written before this change — plays with the viewer's own palette for the other fourteen. The second case is the regression guard.

## Out of scope

Found by the gap-research pass and **declined here**, recorded so no later phase proposes them again as part of this feature. Each is a real divergence from a category leader; none is required by the shell-recording goal.

- **Finding a recording.** Apache Guacamole's connection history lists every session with a per-entry **View** link to its recording, and asciicast v3 has a header `tags` array for exactly this ([Guacamole](https://guacamole.apache.org/doc/gug/recording-playback.html), [v3 spec](https://docs.asciinema.org/manual/asciicast/v3)). Janissary has no listing at all: `play <name>` only works if you already know the tab label (`src/play/run.ts:63`). A recordings list is a separate feature with its own retention questions — it is the natural next thing after this one.
- **Searching inside a recording.** Guacamole 1.6 added searchable, scrollable key-event output inside the playback player, plus activity heatmaps when hovering the progress bar. Janissary's player offers transport, seek, frame-stepping and speed (`web/src/plugins/asciicast/TransportBar.tsx`) and no text search. Also a separate feature: it needs a search index over the recording's own bytes.
- **Markers (`m` events).** asciicast v3 defines them, asciinema's player uses them for navigation and auto-pause, and `asciinema rec` adds them mid-session on a key binding ([player](https://github.com/asciinema/asciinema-player)). Janissary's recorder writes `o`, `r` and `x` only. A marker needs something to mark — a command boundary or a manual action — and neither exists on a shell tab today.
- **Pausing and resuming a recording.** asciinema CLI 3.x has mid-session controls to pause/resume capture and add markers on the fly. Janissary's recording is unconditional from spawn to exit (decision 1), which is the deliberate scope inherited from harness and ssh.
- **Keystroke capture (`i` events) and the player's keystroke overlay.** asciicast v3 defines `i` and the player draws an overlay; the spec's own guidance is that a recorder "should not capture it either unless explicitly requested by the user". Janissary never records input, and for a shell tab the echo already puts typed characters into the `o` stream (decision 1), so an overlay would make a `sudo` password plainly legible where today it is merely present. This needs a privacy decision, not code.
- **Compression.** asciinema CLI reads and writes zstd-compressed `.zst` at roughly 8% of the original size ([asciinema](https://github.com/asciinema/asciinema)). Janissary writes plain `.cast` and clears the directory at each fresh launch. A `.cast` reader would have to understand the compression, so this is a format-lifecycle change, not an optimisation.
- **Idle-time limit on playback.** asciicast v3 has the `idle_time_limit` header field and asciinema's player uses it to cap inactivity. `web/src/plugins/asciicast/usePlayback.ts` deliberately refuses it, and its comment is right: a run that waited ten minutes must stay distinguishable from one that thought for ten minutes. Recorded as a considered divergence, not an oversight.
- **`term.version`.** asciicast v3 records the terminal version from an `XTVERSION` OSC query; Janissary writes `type: 'xterm-256color'` and nothing more. It rode in with the palette as far as the research went and is left out: it describes the emulator, and this app always writes the same value.
- **A real 16-colour palette per app theme.** Decision 13 declares the palette so recordings conform and so a theme *can* override it; choosing what each theme's fourteen non-`fg`/`bg` colours should be is a visual-design task across every theme, and is the thing that turns decision 13 from spec conformance into fidelity.
- **Sharing a recording outside the application.** Warp's session and block sharing put a terminal session behind a link a teammate can watch ([block sharing](https://docs.warp.dev/terminal/blocks/block-sharing)). Already declined in `product/backlog/features.md` § declined as multi-user shared session viewing; not reopened here.

Also already excluded by existing specs, and carried forward:

- Keystroke recording — no asciicast `"i"` events, matching `HarnessRecorder` as it already behaves.
- The inline and full-tab interactive PTYs the `shell` command opens (`shell vim` and friends), which spawn through `PseudoterminalManager.openInlinePty` (`src/pseudoterminal-manager.ts:192`) and stay unrecorded. This is what the ambiguous sentence in `harness-recording.md` § Scope means, and the spec edit is what makes that unambiguous.
- Remote-agent PTY sessions (`src/remote/pty-session.ts`), which run their own session on another host.
- A screen reader, a transcript, or any monitor-feed change for shell tabs. `harnessFeedEntries` and the monitor target validation already skip anything that is not a harness-view tab, so there is no feed for a shell tab to contribute to, and `shellRuntime` constructs neither observer for exactly that reason.
- A separate recordings directory, and any change to the existing clear/preserve lifecycle.
- Any retention, rotation, or size policy. The 4 MiB cap is the existing backpressure guard (`MAX_PENDING_RECORDING_BYTES`), not a file-size limit.
- Recording any other plugin's terminal. `recordsTerminal` is the shell plugin's alone, which is how the scope boundary is enforced by declaration rather than by a plugin-id check.
- Changing what the flag does for a tab with no recording beyond not drawing it pressable.

## Verification

- `./scripts/run.mjs check-diff` after each implementation step — it lints the changed files, typechecks incrementally, and runs the related tests. Never `npm run check`.
- **Manual, shell recording:** open a shell tab with `zsh`, run a few commands including something with colour, resize the browser window mid-session, then `exit`. Confirm `.janissary/recordings/<label>-<timestamp>.cast` exists; that its first line is a valid `{"version":3,…}` header whose `command` is `/bin/zsh`, whose `title` is the tab label, and whose `term.theme` carries the app theme's foreground and background **and a sixteen-colour `palette`**; that an `"r"` event appears for the resize; that an `"x"` event records the shell's exit; and that `asciinema play` on the file replays the session with colours and timing.
- **Manual, the palette:** run something that uses the 16 ANSI colours (a coloured `ls`, or `printf` with SGR 30-37 / 90-97 codes) in a harness tab, then `play` its recording and confirm the colours match the live terminal rather than the viewer's palette. Switch app theme and confirm a *new* recording carries the new theme's `fg`/`bg` while the sixteen still come from the root defaults.
- **Manual, the flag while live:** with a shell tab open and a command running, confirm the film flag is absent until the first output and appears plain, then green, and that pressing it opens an asciicast player tab titled `asciicast: <label>` that follows the session and is not marked finished. Confirm the same on a `harness claude` tab and on an `ssh` tab.
- **Manual, the flag after the end:** let a `harness claude` session exit without closing its tab and confirm the flag is still there and still opens the recording. Do the same for a shell tab by making `.janissary/recordings/` unwritable mid-session: expect one `shell recording failed` line in the notifications feed, the flag still present and pressable, and the shell itself unaffected.
- **Manual, negative checks:** a harness tab opened with `-w` shows the flag plain and unpressable while it provisions, before its clone lands. Start `janus` normally and confirm the recordings directory is cleared; `janus --relaunch` and confirm prior recordings survive. `play <label>` and `open <file>.cast` both reach a shell recording with no change.
- **Browser, through the attached E2E browser:** open a shell tab, watch the flag appear and turn green on the first output, press it, and confirm the player tab opens and follows the live session; then `exit` and confirm the recording replays to the end.