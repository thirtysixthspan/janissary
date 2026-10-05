<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* the msg command to a shell tab, of each type, should be supported.


* Strip terminal control sequences from text the shell tab writes to zsh and to its own terminal, so a multi-line command cannot break out of its bracketed paste.

Existing Issue: `shellCommandInput` frames multi-line commands in bracketed-paste markers without removing an embedded `ESC[201~`, single-line commands are written raw, and the fallback reply path writes application reply text through `markdownToAnsi` into xterm without stripping ESC, C0 or C1 characters. Severity: 7/10

Existing Risk: 7/10 - A pasted line, clipboard-history entry, `send`/`queue` text or dropped file name carrying `ESC[201~` ends the paste early so each following line executes separately, and query sequences in a fallback reply make xterm answer into the PTY.

Proposal Risk: 2/10 - Only printable text, newlines and tabs reach the paste and the fallback renderer, with residual risk limited to escape forms the stripper's pattern does not cover.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1526: strip terminal control sequences from shell input and fallback replies". Add a pure `stripTerminalControls(text)` to a new module in `web/src/plugins/shell/` that removes `\x1b` and the sequences it introduces, C0 controls other than `\n` and `\t`, `\x7f`, and C1 controls (`\x80`-`\x9f`), with a linear regex that passes `security/detect-unsafe-regex`. Apply it in `web/src/plugins/shell/shell-command-input.ts` before framing (both single-line and multi-line paths) and in `web/src/plugins/shell/useShellTerminal.ts` `displayReply`'s fallback path to the markdown text and the echoed command line before `markdownToAnsi`/`formatDispatchedCommand`. Do not touch the control-key path in `web/src/plugins/shell/command-bar-keys.ts`, which deliberately sends `\x03`/`\x04`/`\x1a`. Add tests to `web/src/plugins/shell/shell-command-input.test.ts` for `a\x1b[201~\nb` and for a single line containing `\x1b` and `\x03`, and to `web/src/plugins/shell/markdown-to-ansi.test.ts` (or the new module's test) for `\x1b]7;...\x07` and `\x1b[6n` input; the existing multi-line framing test in `web/src/plugins/shell/ShellTab.test.tsx` must keep passing.


* Authenticate the shell tab's command and directory markers so program output cannot forge them.

Existing Issue: The OSC 133 `C`/`D`/`E` and OSC 7 handlers in the shell terminal accept any matching sequence in PTY output, so any program's output (a `cat` of a crafted file, a remote host over `ssh`) can plant commands in shell history, mark zsh idle mid-command, or change the directory the server records. Severity: 6/10

Existing Risk: 6/10 - A forged `133;D` marks zsh idle while a program is running, so queued lines are written into that program's stdin (a password prompt or a remote shell), and forged `C` and OSC 7 markers corrupt history and the recorded cwd.

Proposal Risk: 3/10 - Markers without the per-session nonce are ignored, though a program that can read the hook text from the terminal scrollback before it is cleared could still learn the nonce.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1526: authenticate shell hook markers with a per-session nonce". In `web/src/plugins/shell/useShellTerminal.ts`, generate a random nonce per attachment (`crypto.getRandomValues`), build `SHELL_STATUS_HOOKS` from a function that embeds it in every emitted marker (for example `133;C;<nonce>;<b64>`, `133;D;<nonce>`, `133;E;<nonce>`, and a private `1337;JanusCwd;<nonce>;<b64-path>` or an OSC 7 variant carrying it), and have the OSC handlers ignore any marker whose nonce does not match. Update `web/src/plugins/shell/shell-command-marker.ts` (`decodeShellCommand`) and its test for the new field layout, and keep the startup-hook history exclusion working by comparing against the generated hook text. If the remount entry about retyping hooks is resolved first, keep the nonce stable for the life of the PTY rather than per mount. Add `web/src/plugins/shell/useShellTerminal.test.ts` cases that markers without or with a wrong nonce do not change running state, history or cwd, and that correctly-signed markers still do.


* Install the shell tab's startup hooks once per terminal rather than retyping them on every mount.

Existing Issue: `useShellTerminal` writes the whole hook-setup line into the PTY and hides the terminal until the `133;E` marker on every attach, and attaching happens on every mount, including docking, undocking and a browser reload of an already-running shell. Severity: 7/10

Existing Risk: 7/10 - Docking a shell or reloading the app while `vim`, `python`, `ssh` or a `sudo` prompt is in the foreground types the hook line into that program, leaves the terminal hidden until it exits, clears the scrollback on `E`, and raises a spurious unread badge and waiting notification.

Proposal Risk: 3/10 - Hooks are installed exactly once for the PTY's life and remounts only re-attach, with residual risk around a client that attaches before the first install completes.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1526: install shell startup hooks once per terminal instead of on every mount". Record on the server whether a shell tab's PTY has been initialised: add an `initialized` boolean to the shell payload in `src/plugins/shell/shared.ts` (with its guard), set it through a new intent (for example `initialized`) in `src/plugins/shell/activate.ts` when the client sees `133;E`, and expose it to `web/src/plugins/shell/ShellTab.tsx`. In `web/src/plugins/shell/useShellTerminal.ts`, take an `initialized` option: when true, skip `handle.write(SHELL_STATUS_HOOKS)`, do not add the `shell-initializing` class, and do not clear on attach; when false, behave as today and report initialisation on `E`. Add `web/src/plugins/shell/useShellTerminal.test.ts` cases that mounting twice for the same pty with `initialized: true` writes no hooks and leaves the terminal visible, plus a `src/plugins/shell/activate.test.ts` case for the new intent and payload field. Update `product/specs/shell-tab.md`'s "Where the shell starts" section to say the hooks are installed once per shell.


* Scope the published app command-bar state to the shell tab that owns it, so one tab's queue popup cannot overwrite every shell's draft, and wake an idle shell when another tab queues a line for it.

Existing Issue: `AppCommandBarProvider`/`useAppCommandBar` give every plugin body the current tab's `queueOpen`, `queueIndex` and `queueItems`, the raw insertion map, `onFocusTab` and an `intercept` that takes any source tab, and `ShellTab`'s queue effect reacts to that global state ungated, while a line queued for an idle shell by `send` or `queue` from another tab never wakes that shell's drain. Severity: 7/10

Existing Risk: 7/10 - Opening and closing `Ctrl+E` in an agent tab overwrites and then clears the unsent draft in every mounted shell, steals focus into a visible docked shell whose typing then edits the agent's queue, and `send <shell> ls` to an idle shell waits indefinitely, contradicting the spec's "runs right away".

Proposal Risk: 3/10 - Each shell sees only its own queue state and wakes on its own queue changes, though the published surface still needs a contract-level review once a second command-bar plugin exists.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1526: scope app command-bar state to the owning shell tab and wake idle shells on queued lines". In `web/src/shared/command-bar/AppCommandBar.tsx`, record which tab the queue popup belongs to (the picker source tab) and expose `queueOpen`/`queueIndex`/`queueItems` to a consumer only when that tab equals the consumer's label; replace the raw insertion map with a `registerCommandLineInsertion(label, handler)` returning an unregister function, and bind `intercept`'s source tab at the provider rather than taking it from the caller. Stop exporting `AppCommandBarProvider` from `web/src/plugins/api.ts` (keep it imported by `web/src/App.tsx` from its defining module). In `web/src/plugins/shell/ShellTab.tsx`, pass the tab's own label so the queue effect only runs for this tab. For waking: have `src/commands/send.ts` and `src/commands/queue.ts`, when the target is a terminal-owning plugin tab, cause the shell tab's view to change (for example bump a `queuedCount` field in the shell payload through `updateTab`, or include the queue length in the host-state slice), and in `web/src/plugins/shell/useShellCommandQueue.ts` wake the queue when this tab's own count increases and zsh is idle. Add a `ShellTab.test.tsx` case that toggling `queueOpen` for a different source tab leaves the draft and focus alone, a case that an idle shell drains a line added by another tab, and keep `web/src/shared/command-bar/AppCommandBar.test.tsx` and the `src/commands/send.test.ts`/`queue.test.ts` cases passing.


* Stop a declared plugin chord from firing in a docked plugin tab when focus is in a tab that has no plugin label, so `Ctrl+R` in an agent tab opens the application's history.

Existing Issue: `createPluginChordRegistry().run` in `web/src/plugins/PluginChords.tsx` falls back to the only registered claim when focus is inside no `[data-tab-label]` element, and agent tab bodies carry no such attribute, so with one visible docked shell the shell's `Ctrl+R` claim runs while the user is in an agent tab. Severity: 6/10

Existing Risk: 6/10 - `Ctrl+R` in an agent tab toggles the docked shell's history popup, which the agent bar's keyboard cannot drive, while with two docked shells it falls back to the app, so the key's meaning depends on how many shells are docked.

Proposal Risk: 2/10 - A chord with no focused plugin tab belongs to the application as both specs state, with residual risk only for a plugin body that fails to set its label attribute.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1526: keep plugin chord claims from firing when focus is outside a plugin tab". In `web/src/plugins/PluginChords.tsx`, remove the single-claim fallback branch in `run` so an undefined `focusedTabLabel` returns `false`; confirm in `web/src/useWindowKeys.ts` (`handleChordKeys`) that an undocked current shell tab still resolves its label through `PluginTabLayer`'s `data-tab-label` when focus is on the document body, and if not, pass the current tab's label explicitly when the current tab is a plugin tab and focus is not inside another tab. Add a `web/src/useWindowKeys.test.ts` case registering a shell claim, focusing a textarea with no `data-tab-label`, pressing `Ctrl+R`, and expecting the app history picker to open; keep the existing chord-precedence tests passing.


* Open pickers raised from a shell command bar over the tab that raised them and act on that tab's bar and queue.

Existing Issue: The task and queue pickers decide which command bar and queue to use from the current tab rather than the picker's source tab, and a picker raised by a hidden, undocked shell (for example while draining its queue) is rendered nowhere while still taking modal keys. Severity: 6/10

Existing Risk: 6/10 - A task picked from a docked shell's `tasks` picker is inserted into the centre agent bar, `queue` from a docked shell lists the agent's queue, and a queued `tasks` line in a background shell opens an invisible picker that captures arrow, Return and Escape in whatever tab is in front.

Proposal Risk: 3/10 - Pickers follow their source tab and an invisible source falls back to the visible tab, with residual risk in any picker hook not yet keyed on the source tab.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1526: key shell-raised pickers on their source tab". In `web/src/pickers/useTaskPicker.ts`, choose the insertion target from `pickerSourceTab ?? current.label` (and only use the shell insertion path when that tab is a shell); in `web/src/pickers/useQueuePicker.ts` and `web/src/pickers/usePickerOverlays.ts`, take `isShellTab`, `queueItems` and the edit/delete targets from the source tab's record instead of `current`. In `web/src/App.tsx`, where `pickerSourceTab` is set, refuse to set a source tab that is neither the current tab nor docked-and-visible (clear the source so the picker renders over the current tab), or skip opening a picker for an invisible source. Add App-level tests (in `web/src/App.test.tsx` or `web/src/pickers/useTaskPicker`/`useQueuePicker` tests) that a docked-shell `tasks` pick calls the shell's insertion handler and that an intercept from a hidden shell does not leave an unrendered modal picker; keep `web/src/pickers/useQueuePicker.test.tsx` passing.


* Restore the status windows' agent and harness auto-show behavior that the shared hook change altered.

Existing Issue: `useStatusWindows` now takes `active` and content flags that default to true and false, and the agent, inactive-agent, harness and editor callers pass neither, so agent tabs no longer re-show a window when it gains its first row and every mounted harness tab arms its auto-show whenever the current tab changes. Severity: 5/10

Existing Risk: 5/10 - A harness tab visible in the other split pane pops its schedule panel for five seconds each time the other pane's tab changes, and an agent tab's first new connection or schedule entry no longer surfaces its window.

Proposal Risk: 2/10 - Each caller passes its own visibility and content, restoring the earlier behavior, with residual risk only in callers whose visibility is computed differently from the old `isActive` gate.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1526: restore agent and harness status-window auto-show behavior". In `web/src/agent-tabs/AgentTabBody.tsx`, `web/src/agent-tabs/InactiveAgentTabBody.tsx`, `web/src/harness/HarnessTabLayer.tsx` and `web/src/editor/useEditorConnections.ts`, call `useStatusWindows` with `{ active, connectionsHaveContent, scheduleHasContent }` reproducing the pre-PR inputs (for the harness layer: `active: t.label === current.label`, connections only when not schedule-only, schedule when it has rows; for agent tabs: content from `current.connections.length > 0` and `current.schedule.length > 0`). Check `web/src/shared/status-windows/useStatusWindows.ts` hides an empty window (the PR removed the `hasContent` gate from `visible`) and that `StatusPanels` still renders nothing for empty lists. Add tests in `web/src/shared/status-windows/useStatusWindows.test.ts` or a harness-layer test that a non-current harness tab does not auto-show and that an agent tab re-shows on gaining its first row; existing status-window tests must keep passing.


* Bound the working directory a new agent inherits from its source tab, so `agent --no-workspace` and the new-agent button cannot place an unconfined agent inside another tab's clone or outside its own.

Existing Issue: `launchAgent` now starts `agent --no-workspace` in the source tab's cwd instead of the project checkout, and `newAgentAt` now starts a workspaced source's new agent in the source's current cwd instead of its clone, contradicting `product/specs/agents.md` and `product/specs/workspaced-agent.md`, which were not updated. Severity: 7/10

Existing Risk: 7/10 - `agent --no-workspace` from a workspaced tab starts an unconfined agent inside that tab's clone, which is deleted under it when the source closes, and the ➕ button after a `cd` out of the clone starts a confined agent outside the directory its Seatbelt profile allows.

Proposal Risk: 2/10 - The inherited directory is used only when it is inside the bound that applies to the new agent, otherwise the documented default is kept, with residual risk only for a remote source whose cwd belongs to another host.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1526: bound the cwd new agents inherit from their source tab". In `src/profile/new-agent.ts` (`launchAgent`, `!parsed.workspace` branch), use the source cwd only when the source is local, not workspaced, and `isInsideRoot(launchDir, cwd)` holds; otherwise use `managers.tab.launchDir` (the project checkout the spec names). In `src/profile/manager.ts` (`newAgentAt`), keep the source cwd only when `isInsideRoot(creator.workspaceDir, cwd)`; otherwise use `creator.workspaceDir`. Use the shared containment helper in `src/plugins/files.ts` (or move it to a neutral module if importing from plugins is wrong for profile code). The shell-tab spec's line that a new agent from a shell shares its workspace must still hold. Add `src/profile/manager.test.ts` cases for a workspaced source running `agent --no-workspace`, a remote source, a source cwd outside the root, and a workspaced source whose cwd left its clone. Update `product/specs/agents.md` and `product/specs/workspaced-agent.md` to state that a subdirectory inside the allowed bound is kept.


* Record the directory a new shell's terminal actually started in, not the source tab's directory.

Existing Issue: `openPluginTab` sets the new shell tab's recorded cwd to `source.runtime?.cwd`, while the shell plugin may have started the terminal in the workspace clone or project root because the source cwd was outside the allowed bound. Severity: 4/10

Existing Risk: 4/10 - After a shell `cd /tmp` and `Cmd+T`, the new shell runs at the project root while completion, open-file-navigator-here and new agents use `/tmp` until a browser mounts the tab and zsh reports its cwd, which never happens for a shell opened with no client attached.

Proposal Risk: 2/10 - The recorded directory matches the terminal's starting directory from the moment the tab exists, with residual drift only until the first OSC 7 report after a `cd`.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1526: record a new shell's actual starting cwd". In `src/tab/openers.ts`, have `withResources` capture the `cwd` passed to each `spawnTerminal` call alongside `terminalIds`, and in `openPluginTab`'s `afterApply` set `tabRuntime(minted).cwd` from the spawned terminal's cwd rather than from `source.runtime?.cwd`. Extend the existing "retains the source workspace" case in `src/tab/manager.test.ts` with a source cwd outside the root, asserting the recorded cwd equals the spawned cwd; existing shell-open tests in `src/plugins/shell/activate.test.ts` must keep passing.


* Decode shell working-directory reports exactly, so paths containing `#`, `?`, `%` or a backslash are recorded correctly and reports from another host are ignored.

Existing Issue: The zsh hook prints `$PWD` into an OSC 7 `file://` URL without percent-encoding it, and the client parses it with `new URL` and `decodeURIComponent`, so `#` and `?` truncate the path, `%` makes decoding throw and leaves the cwd stale, `%41` is decoded to `A`, `\` becomes `/`, and the hostname is ignored. Severity: 5/10

Existing Risk: 5/10 - After `cd` into a directory whose name contains one of these characters, the metadata row, file navigator, new shells and new agents use the wrong directory, and an `ssh` session's OSC 7 is recorded as a local path.

Proposal Risk: 2/10 - The path round-trips byte-for-byte and foreign hosts are ignored, with residual risk only for path bytes that are not valid UTF-8.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1526: decode shell OSC 7 working-directory reports exactly". In `web/src/plugins/shell/useShellTerminal.ts`, change `_janus_emit_cwd` in `SHELL_STATUS_HOOKS` to emit the path in an unambiguous form, either percent-encoded by zsh (`${(q)...}` is not URL encoding, so use a small zsh loop or `print -rn -- $PWD | base64` in a private marker) and change the OSC handler to strip the `file://<host>` prefix by hand, compare the host with the local `$HOST` value captured at hook install, and decode only what the hook encoded. Move the parse into a pure helper beside `web/src/plugins/shell/shell-command-marker.ts` with its own test file covering `#`, `?`, `%`, `%41`, `\`, spaces, and a foreign host. Update the existing `useShellTerminal.test.ts` case that feeds a pre-encoded `child%20dir` so it feeds what the real hook emits. If the marker-nonce entry has landed, carry the nonce in the same marker.


* Keep the host's idle queue drain from running a shell tab's queued lines through the per-tab piped shell.

Existing Issue: Shell-tab lines queued with `queueLine` live in the same per-tab queue the host drains in `drainQueueOp` when a tab leaves the busy set, and that drain runs every line through `CommandManager.run` without checking the tab's view, so an unclaimed line would run in the piped background shell instead of zsh. Severity: 5/10

Existing Risk: 4/10 - If a shell tab ever enters the host busy set (for example an `acp` line dispatched from its bar) while lines are queued, those lines run invisibly in the wrong shell and the client's `dequeue` finds the queue empty.

Proposal Risk: 2/10 - The host drain skips plugin tabs, whose queues only the plugin drains, with residual risk only if a plugin tab is later meant to share agent-queue semantics.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1526: keep the host idle drain away from shell-tab queues". In `src/command/queue.ts` (`drainQueueOp`), return without dequeuing when the tab at `index` is a plugin tab (`tab.view === 'plugin'` or `tab.plugin !== undefined`), mirroring the `isAgentTab` check `dispatchOrRunOp` already makes. Add a `src/command/manager.test.ts` (or `src/command/queue` test) case that a plugin tab with queued lines leaving the busy set keeps its queue intact and runs nothing; existing agent-queue drain tests must keep passing.


* Open a sibling shell with `Cmd+T` when the shell's terminal has focus, as the spec says.

Existing Issue: `Cmd+T` is handled in `ShellTab`'s command-bar key handler only, so with the terminal focused the window handler opens an agent tab instead of another zsh tab. Severity: 4/10

Existing Risk: 4/10 - A user typing in the terminal presses `Cmd+T` expecting a new shell and gets a new agent tab in the wrong place.

Proposal Risk: 2/10 - The chord is claimed for the whole visible shell tab through the declared-chord path, with residual risk only if the terminal's xterm key handler swallows the keydown before the window listener.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1526: open a sibling shell with Cmd+T from the focused terminal". Declare the new-tab chord in the shell manifest's chord list in `src/plugins/shell/manifest.ts` (check the chord-id validation in `src/plugins/declared-resources.ts` and `src/tab/view.ts` accepts it), handle it in `web/src/plugins/shell/ShellTab.tsx` through `usePluginChordClaims` alongside the existing `Ctrl+R` claim by dispatching `zsh` the way the bar handler does, and remove the bar-only branch so there is one path. Confirm `web/src/useWindowKeys.ts` consults plugin claims before `newAgentTab`. Add a `ShellTab.test.tsx` case that a `Cmd+T` keydown with the terminal focused dispatches `zsh`, and a `web/src/useWindowKeys.test.ts` case that the claim beats the agent default; update `src/plugins/declaration-validation.test.ts` if the chord list is pinned.


* Route clicks on links inside shell reply decorations to the application's link opener instead of navigating the app window.

Existing Issue: Reply decorations set `innerHTML` from the transcript markdown renderer and enable pointer events, but have no click handler, unlike the transcript, which prevents default and calls its link opener. Severity: 5/10

Existing Risk: 5/10 - Clicking an `https://` link in a `help` reply navigates the whole Janissary window away, dropping the user out of the app.

Proposal Risk: 2/10 - Anchor clicks open through the same path the transcript uses, with residual risk only for non-anchor interactive markup the renderer might add later.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1526: route link clicks in shell reply decorations to the app link opener". Find how `web/src/agent-tabs/` transcript lines intercept anchor clicks (`transcript-line.tsx`) and what opener they call; publish an equivalent `openLink(href)` on the plugin client capabilities in `web/src/plugins/api.ts` if one is not already exposed. In `web/src/plugins/shell/markdown-block.ts` (`fill` or the block creation), add a click listener on the decoration element that, for a click inside an `a[href]`, calls `preventDefault()` and the opener; pass the opener in from `useShellTerminal.ts`. Add a `web/src/plugins/shell/markdown-block.test.ts` case that clicking an anchor calls `preventDefault` and the opener with its href.


* Queue a second command-bar line submitted before zsh reports the first one as running.

Existing Issue: The shell command queue only marks itself busy when `drain()` runs a line, so a line submitted directly from the bar leaves the queue idle until zsh's `133;C` marker arrives after a dispatch round-trip, and a second line submitted in that window is written straight into the PTY. Severity: 4/10

Existing Risk: 4/10 - Typing `ssh host` then `ls` quickly sends `ls` into the starting program's input instead of queueing it, contradicting the spec that lines submitted while zsh is running are queued.

Proposal Risk: 2/10 - Every line the bar sends to zsh marks the queue busy until zsh's prompt marker, with residual risk only if zsh never emits the marker for a line.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1526: mark the shell queue busy as soon as a bar line is sent to zsh". In `web/src/plugins/shell/shell-command-queue.ts`, add a `markBusy()` (or have `submit` own the run and set `busy` when the run reports the line went to zsh), and in `web/src/plugins/shell/useShellCommandQueue.ts` call it when `runReference.current(line)` resolves that the line was written to the PTY rather than handled by the application. Add a `web/src/plugins/shell/shell-command-queue.test.ts` case where two submits occur before any `C` marker and the second is enqueued and runs after `D`; keep the existing queue tests passing.


* Name shell tabs with the same launch-name check unnamed agents use, so a shell cannot take a name held by a detached or provisioning session.

Existing Issue: `unusedAgentName` picks a pool name using only open tab labels, while unnamed agents go through `checkLaunchName`, which also refuses names held by session rows in provisioning, active, reconnecting or detached state, so shells are not named "exactly as an unnamed agent tab is" as the spec says. Severity: 3/10

Existing Risk: 3/10 - A shell takes the name of a detached remote agent, and reattaching or relaunching that agent then clashes with an open tab label.

Proposal Risk: 1/10 - Shell and agent naming share one rule, with residual risk only in passing session rows into the tab creator.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1526: name shell tabs through the launch-name check". In `src/tab/unique-labels.ts`, replace `unusedAgentName`'s `resolveAgentName` call with `checkLaunchName` from `src/launch-name/check.ts` using `poolCandidates()` and the sessions rows (`managers.sessions.view()`), the same inputs `resolveLocalLaunchName` in `src/launch-name/local.ts` uses, falling back to `uniquePluginLabel` when no name is accepted; thread the session rows through `addPluginTab` in `src/tab/creators.ts` and its caller in `src/tab/openers.ts`. Add a `src/tab/creators.test.ts` case with a detached session row holding the first pool name, asserting the shell takes the next one; keep the existing naming tests passing.


* Remove the unused `dispatchLine` capability and share one execute-and-capture helper between the shell dispatch path and message capture.

Existing Issue: `dispatchLine` was added to the v1 plugin contract, its capability list, the line capabilities, `CommandManager` and the shell manifest, but nothing calls it, and `dispatchLineWithOutput` copies the subscribe, execute, unsubscribe capture from `CaptureManager.runCommand`, while `ShellIntent` in the shell's shared module is unused and stale and `isTerminalStatus` has no production caller. Severity: 4/10

Existing Risk: 4/10 - The contract carries a permanent public capability with no caller and a manifest requesting it, and two copies of the output-capture seam drift, so a fix to one (for example honoring `Command.capture` hooks) misses the other.

Proposal Risk: 2/10 - One capture helper and a smaller contract, with residual risk only if an out-of-tree plugin already declared `dispatchLine`.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1526: remove dispatchLine and share command output capture". Delete `dispatchLine` from `src/plugins/api.ts`, `src/plugins/api-capabilities.ts`, `src/plugins/line-capabilities.ts`, `src/command/manager.ts` and `src/plugins/shell/manifest.ts`, and remove or retarget its tests in `src/command/manager.test.ts` and `src/plugins/shell-capabilities.test.ts`; update `documentation/developer-documentation/tab-plugins.md` and `src/plugins/documentation.test.ts` if they list it. Extract an `executeAndCapture(label, run)` helper (in `src/capture/` or `src/command/`) that subscribes to `entry:appended` for the label, awaits the run, unsubscribes, and returns the joined output, and use it from both `CaptureManager.runCommand` in `src/capture/manager.ts` and `CommandManager.dispatchLineWithOutput`. Remove `ShellIntent` and, if still unused outside tests, `isTerminalStatus` from `src/plugins/shell/shared.ts` and its test. Existing `src/capture/*.test.ts` and `src/command/manager.test.ts` capture tests must keep passing.


* Share one predicate for "a plugin tab that owns a terminal" across send, queue and schedule targeting.

Existing Issue: The check that a tab is a plugin tab owning a live terminal is written separately in `send`, `queue` and the schedule target filter, so the three rules for which tabs accept shell input can diverge. Severity: 3/10

Existing Risk: 3/10 - A later change to terminal ownership updated in one place leaves `send`, `queue` and `schedule` disagreeing about whether a shell tab is a valid target.

Proposal Risk: 1/10 - One exported predicate used in three places, with no behavior change expected.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1526: share the terminal-owning plugin tab predicate". Add an exported `ownsTerminal(tab, managers)` (or a method on `TabManager` in `src/tab/manager.ts`) beside the plugin terminal ownership code in `src/tab/plugin-terminals.ts`, and replace the inline checks in `src/commands/send.ts` (`deliverTo`), `src/commands/queue.ts` (`run`) and `src/schedule/targets.ts` (`canRunSchedules`). Existing `src/commands/send.test.ts`, `src/commands/queue.test.ts` and `src/commands/schedule.test.ts` shell-tab cases must keep passing; add a small unit test for the predicate.


* Store the host-state delivery fingerprint on the plugin tab record instead of a module-level map keyed by plugin and instance.

Existing Issue: `src/plugins/host-state.ts` keeps `lastPushed`, a module-level `WeakMap<PluginRecord, Map<instanceKey, fingerprint>>` cleaned by a manual sweep, which is the parallel per-tab map that architecture principle 2 and the plugin guidelines rule out. Severity: 3/10

Existing Risk: 3/10 - A tab closed on a path the sweep does not see leaves a stale fingerprint, so a reused instance key can skip its first host-state push and show empty connection or schedule windows.

Proposal Risk: 1/10 - The fingerprint lives and dies with the tab record, with residual risk only if tab rebuilds drop the runtime sub-record.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1526: keep the host-state fingerprint on the plugin tab record". Move the last-pushed fingerprint into the tab's runtime record via `tabRuntime(tab)` from `src/tab/runtime.ts` (as `src/harness/idle-notification.ts` does for its own per-tab state), read and write it in `src/plugins/host-state.ts`, and delete the `WeakMap` and its sweep. The label-reuse and change-detection cases in `src/plugins/host-state.test.ts` must keep passing unchanged.


* Replace the core's hard-coded checks for the shell plugin with declared plugin capabilities.

Existing Issue: Core client code branches on `plugin?.id === 'shell'` in the mounted view layers, picker overlays and queue picker, and the tab strip imports the shell's payload guard to drive the busy dot, so the core depends on one plugin's id and payload shape. Severity: 4/10

Existing Risk: 4/10 - The next plugin with a command bar silently gets none of the picker, queue or busy behavior, and a change to the shell payload breaks the tab strip, against the plugin guidelines' registry-over-conditionals rule.

Proposal Risk: 2/10 - Behavior is driven by declared flags on the plugin and a host-set busy state, with residual risk in getting every former shell branch onto the new flag.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1526: replace hard-coded shell plugin checks with declared capabilities". Add a declaration flag (for example `hostsCommandBar: true`) to the plugin declaration in `src/plugins/api.ts`, validate it in `src/plugins/declared-resources.ts`, set it in `src/plugins/shell/manifest.ts`, and carry it on the tab's wire view in `src/tab/view.ts`. Replace the `plugin?.id === 'shell'` checks in `web/src/MountedViewLayers.tsx`, `web/src/pickers/usePickerOverlays.ts`, `web/src/pickers/useQueuePicker.ts` and `web/src/pickers/useTaskPicker.ts` with that flag. For the busy dot, have the shell's `command-state` intent in `src/plugins/shell/activate.ts` set the tab's host busy or running state through a capability, and drop the `isShellPayload` import from `web/src/TabItem.tsx`. Keep `web/src/TabStrip.test.tsx`, `web/src/MountedViewLayers.test.tsx` and the picker tests passing and add a declaration-validation case for the flag.


* Remove the shell overlay branches in the mounted view layers that never render, and stop drawing two tab navigators over a shell tab.

Existing Issue: `MountedViewLayers` renders `quickOpenOverlay`, `appThemePickerOverlay` and `contributedOverlay` for a shell only when `pickerOverlays` is absent, but `AppMain` always passes it, so those branches and the elements built for them are dead, and with the navigator open over a shell both the explicit `TabNavPicker` and `pickerOverlays`' own navigator render. Severity: 4/10

Existing Risk: 4/10 - Two stacked tab navigators appear over a shell tab, and the dead props and their tests describe a rendering path production never takes.

Proposal Risk: 1/10 - One navigator and no unused props, with residual risk only in tests that relied on the dead path.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1526: remove dead shell overlay branches and the duplicate tab navigator". In `web/src/MountedViewLayers.tsx`, delete the three `!pickerOverlays && ...` shell branches and render the explicit `TabNavPicker` only for plugin tabs that do not receive `pickerOverlays`; remove the now-unused `quickOpenOverlay`/`appThemePickerOverlay`/`contributedOverlay` props from `web/src/AppMain.tsx` and the element built for them in `web/src/pickers/picker/overlay-props.ts` if nothing else consumes it. Update `web/src/MountedViewLayers.test.tsx` so its shell cases pass real `pickerOverlays`, and add a case with a shell tab, `navOpen`, and `pickerOverlays` expecting exactly one `.tab-nav-picker`.


* Use the existing shared textarea splice helper in the shell tab instead of a copy.

Existing Issue: `insertCommandAtCaret` in the shell plugin is a line-for-line copy of `spliceIntoTextarea` in the shared command-bar module, with no test of its own. Severity: 2/10

Existing Risk: 2/10 - A fix to caret insertion (undo behavior, caret placement) lands in one copy and not the other, so clipboard and picker insertion behave differently in shell and agent bars.

Proposal Risk: 1/10 - One helper published through the plugin API, with no behavior change expected.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1526: reuse spliceIntoTextarea in the shell tab". Export `spliceIntoTextarea` from `web/src/plugins/api.ts` (importing it from `web/src/shared/command-bar/textarea-splice.ts`), replace the uses of `insertCommandAtCaret` in `web/src/plugins/shell/` with it, and delete `web/src/plugins/shell/insert-command-at-caret.ts`. Add `spliceIntoTextarea` to the export assertions in `web/src/plugins/api.test.ts` if that test pins the surface; existing `ShellTab.test.tsx` clipboard and task insertion cases must keep passing.


* Correct the pull request description's file list and behavior summary to match the branch.

Existing Issue: The description lists 37 `product/plans/complete/*.md` files as removed although none exists on master or appears in the diff, omits the three follow-up plans, `product/backlog/pull-request.md` and `web/src/plugins/shell/shell-command-input.ts` with its test, and never mentions the terminal copy chord, the bracketed-paste multi-line submit, or the exclusion of startup hooks from shell history. Severity: 3/10

Existing Risk: 3/10 - A reviewer verifying the file list hunts for deletions that do not exist and approves three user-visible behaviors the description never asked them to check.

Proposal Risk: 1/10 - The description matches the diff, with residual drift only from commits added after the correction.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1526: correct the description's file list and behavior summary". In the pull request body's "Files changed" section, delete the 37 "remove the consolidated fix plan" bullets, add bullets for `product/plans/complete/shell-tab-ignore-startup-history.md`, `product/plans/complete/shell-tab-keyboard-copy.md`, `product/plans/complete/shell-tab-multiline-submit.md`, `product/backlog/pull-request.md`, and `web/src/plugins/shell/shell-command-input.test.ts` and `web/src/plugins/shell/shell-command-input.ts`; in "What" and "How to verify", add one sentence each for `Ctrl+Shift+C`/`Cmd+C` terminal copy, multi-line commands submitted to zsh as one bracketed paste, and the setup hook being kept out of shell history. Compare the final list against `git diff origin/master...HEAD --name-only` before applying. Leave every other paragraph and the title untouched.


* Reconcile the shell-tab plan's stale statements about tab naming and directory tracking with its own later sections and the implementation.

Existing Issue: The plan's design decisions still say each tab is named `shell`, `shell2` while its summary, the spec and the code use the agent-name pool with a `shell`, `shell-2` fallback, and its "Declined" list says the metadata row reports the starting directory while its design decisions and the code follow zsh's cwd. Severity: 2/10

Existing Risk: 2/10 - A later agent reading the plan as the record of intent "fixes" the cwd tracking or the naming back to the declined or stale behavior.

Proposal Risk: 1/10 - The plan agrees with itself and the spec, with no code change.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1526: reconcile the shell-tab plan's naming and cwd statements". In `product/plans/complete/shell-tab.md`, rewrite the "The tab is named `shell` and is opened by `zsh`" decision to describe agent-pool naming with the `shell`, `shell-2` fallback (matching `src/tab/creators.ts`, `src/tab/unique-labels.ts` and `product/specs/shell-tab.md`), and change the declined "A tab name that follows `cd`" bullet so it declines only renaming the tab, not cwd tracking in the metadata row. No code or spec changes.
