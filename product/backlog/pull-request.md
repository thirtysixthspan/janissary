<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Keep the client's quit confirmation and close save guard in front of a disabled quit or close line so a stale client cannot dispatch either without them.

Existing Issue: The disabled-command early return in useAppCommandLine sends a quit or close line straight to the server before classifyCommandBarSubmit can open the quit confirmation or run the close save guard, so a client that still believes either command is disabled while the server has it enabled dispatches the destructive command without the guard. Severity: 7/10

Existing Risk: 6/10 - A stale state snapshot during a re-enable race can quit the app or close a tab with unsaved work without the confirmation or save walk the client exists to provide, losing editor buffers or plugin state.

Proposal Risk: 2/10 - The guard runs before the server refusal, so a genuinely disabled quit or close asks for confirmation and then reports Command is disabled; the command still cannot run while the server's snapshot is disabled.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1968 "keep the quit and close guards in front of disabled quit and close lines". In web/src/shared/command-bar/AppCommandBar.tsx, classify the line with classifyCommandBarSubmit before the disabledApplicationCommand early return, or run the same verdict for quit and close first: when the verdict is confirm-quit, open the quit confirmation as today; when it is confirm-close, run guardRef.current(index) and return true when it declines; only return false after the guard accepts so the server's current snapshot decides whether the command is refused or runs. Do not change the disabled handling for picker words, nav, or ordinary lines. Update web/src/shared/command-bar/AppCommandBar.test.tsx with disabled quit and close cases that assert the confirmation or guard still runs and the bar does not offer the line onward before it accepts, and adjust web/src/App.test.tsx's disabled quit case to the guarded behavior. Update the stale-client sentence in product/specs/application-commands.md and the plan's manual step 1 so they state that destructive command-bar lines keep their client guard before the server refusal. Keep the existing enabled close and quit tests green.


* Correct the plan's hand-edit verification step, which expects the server to refuse a settings-file change it has not re-read.

Existing Issue: The plan's manual step 3 says a hand-edited theme disable is refused by the server without opening Commands, but NativeCommandSettingsManager only reads commands.json in its constructor, refresh, and edit, so a hand edit is invisible to the server and theme <name> still runs. Severity: 4/10

Existing Risk: 4/10 - A reviewer following the step sees the theme apply and can wrongly conclude the server is authoritative over hand edits, or records a failed verification that is actually the documented read point.

Proposal Risk: 1/10 - The plan states the real read points; no code changes, so the server behavior stays as unit 2 defined it.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1968 "correct the hand-edit verification step in the client integration plan". Rewrite Verification step 3 in product/plans/complete/native-commands-10-client-integration.md: hand-edit commands.json, reopen Commands (which calls the commands topic refresh), and confirm the client list follows; state explicitly that without a refresh or edit both the client and the server keep the old snapshot, so a stale client may open the theme picker and the server still runs theme <name>. If the step needs to prove server authority, describe a stale client against a server that has refreshed, for example a test client that missed the state broadcast, not a hand edit alone. Add a src/native-commands/state.test.ts or feature.integration.test.ts case that manager.current() ignores a hand edit until refresh() is called and then reflects it, so the read point is pinned. Do not add a file watcher or refresh on dispatch.


* Add the disabled-command condition to the in-app help pages, which the plan's documentation update left stale.

Existing Issue: The plan updates the user documentation but not help/keys.md, help/commands.md, or the per-command help pages, which still say Ctrl+R, Ctrl+A, Ctrl+E, Cmd+Shift+F, Cmd+T, and the theme, syntax, history, queue, tasks, search, close, and quit pickers or confirmations run unconditionally. Severity: 4/10

Existing Risk: 3/10 - A user reading help keys or help theme gets guidance that contradicts the Commands tab gating and the docs site, and the generated Command Reference pages inherit the stale text.

Proposal Risk: 1/10 - The help text matches the shipped behavior; the risk is only wording drift if a later change alters the gating again.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1968 "document disabled-command gating in the in-app help pages". Update help/keys.md rows for Ctrl+R, Ctrl+A, Ctrl+E, Cmd+Shift+F, and Cmd+T, plus the shell-tab Ctrl+R, Ctrl+E, Cmd+T, and search transcript rows, to say the shortcut is blocked when hist, tasks, queue, search, or shell is disabled in the Commands tab. Add a short note to help/commands.md that a disabled command is refused and its picker, confirmation, or shortcut does not run. Add the same condition to help/hist.md, help/queue.md, help/tasks.md, help/theme.md, help/syntax.md, help/search.md, help/close.md, and help/quit.md where each says the command opens a picker or confirmation; for close and quit, match the guarded behavior left by the quit and close guard entry above so the help text says the confirmation still runs before the server refusal. Keep the Commands table alphabetical and leave src/commands.test.ts green; the docs site's Command Reference is generated from these pages, so edit help/ rather than a generated copy. Add help/ to the plan's Proposed changes 6 documentation list.


* Add the missing disabledApplicationCommands field to the two full state-event fixtures in the web socket tests.

Existing Issue: web/src/shared/ws/ws.test.ts still sends full state events without disabledApplicationCommands in the dialog-normalization it.each case and the toast test, although the plan says to update every StateEvent fixture unless the case varies the field. Severity: 2/10

Existing Risk: 2/10 - The tests keep exercising a legacy state shape and would not notice a client change that starts requiring the new field; the suite no longer mirrors current server output.

Proposal Risk: 1/10 - Adding the empty list makes the fixtures representative; it does not change the behavior under test.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1968 "add disabledApplicationCommands to the remaining web socket state fixtures". In web/src/shared/ws/ws.test.ts, add disabledApplicationCommands: [] to the state event built inside the "normalizes %s dialog fields to null" it.each case and to the state event used by the toast test. Leave the minimal { t: 'state', tabs: [] } events in the reconnection tests as they are, since they are not full StateEvent fixtures. Run the focused web socket test file; no production code changes.


* Cover the new server-side blocked-command report and settings re-broadcast with tests instead of leaving both seams mocked or unexercised.

Existing Issue: ControllerCore.reportBlockedCommand has no test beyond the handler mock, and the createManagers subscription that re-broadcasts state on every settings publication is not exercised, so the unknown-tab guard, the command-disabled notification, and the live client update can regress silently. Severity: 4/10

Existing Risk: 3/10 - A future change to the controller method or the manager subscription can break blocked-shortcut notifications or leave every client's disabled list stale without a failing test.

Proposal Risk: 1/10 - The tests pin the existing behavior; no production behavior changes.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1968 "test the blocked-command report and settings re-broadcast". Add src/controller.test.ts cases using createControllerTestProject and a temporary NativeCommandSettingsManager: reportBlockedCommand('hist', 'ghost') with no open tab does nothing and does not throw; reportBlockedCommand('hist', 'worker') with a background worker tab and hist disabled records the existing command-disabled notification with Command is disabled: hist.; the same call with hist enabled records nothing. Add a create-managers or controller test that edit() or refresh() on the settings manager triggers the emitState sink and the emitted state event carries the disabledApplicationCommands list, using a spy sink and a temporary home and project. Model the notification assertions on src/command/manager.test.ts's disabled-command cases. No production changes.
