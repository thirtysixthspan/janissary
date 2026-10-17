# System schedules 03: initial system-shell startup and ensure

**Complexity: 6/10** — startup ordering, guarded plugin outcomes, live-PTY identity checks, manager disposal and retry semantics cross several server seams; shell-specific work is limited to the hidden initial shell's focus behavior.

This plan depends on completed plans 01 and 02. It adds the initial managed system shell and its retryable ensure seam, but no schedule or `execute` caller.

## Goal

After the required `janus` shell opens, attempt to create one hidden, unsandboxed zsh system shell in the project directory. A system-shell failure posts the existing startup-failure notice but does not stop the application or remote-session restoration. A `janus` shell failure remains fatal.

The feature's authoritative decisions are in `product/plans/ready/add-system-schedules.md`, especially “The `system` shell tab” and “Notifications”. This is only the initial startup and ensure slice of that feature.

## Decisions and dependencies

- Dependencies: completed and reviewed 01 (managed identity, hidden placement and user-close lifecycle) and 02 (the `system-schedule-fire` notice and `notifySystemShellStartFailure`). Reuse their shipped code and tests; do not re-add the `hidden` or `systemShell` fields, reserved label, reveal behavior or notice contract.
- Rebased CLI baseline: `d21c4211` removed `--relaunch`. `src/cli-args.test.ts:59` (“throws CliUsageError on the removed --relaunch flag”) and `src/index.ts:18` (`ServerOptions`) confirm there is no launch-mode option. Keep the CLI unchanged; every ordinary `startServer` call takes the same startup path.
- The only production `startServer` caller is `src/main.ts:85` (`startServer` with ordinary options); startup has one caller chain. `src/index.ts:62` (`await openLaunchShell`) currently precedes `src/index.ts:70` (`controller.reattachSessions()`). Await `managers.systemShell.ensure()` between them. Keep `reattachSessions()` unconditional and non-awaited, including when ensure returns failure; remote tabs may arrive later and must not delay local startup or become managed system shells.
- `openLaunchShell` is still a required, fatal startup step. Replace its `src/launch-shell.ts:17` (`tabs.length > 0`) success check with validation of the canonical `janus` tab: plugin ownership is `shell`, its current shell payload has a PTY id, and that id is the live local terminal registered to the same tab. Use the plugin host's payload validation rather than importing the concrete shell activation into core. Preserve the launch shell's actual rejection reason in the fatal startup error.
- Add `TabPluginHost.runCommandResult()` over the existing guarded command invocation. Reuse `PluginCallOutcome` in `src/plugins/invoke.ts:16–19` (`ok`, `rejected`, `failed`) and return an explicit failure when activation is disabled or fails. Preserve the actual rejection reason from `invokePlugin` (`src/plugins/invoke.ts:73–74`); do not recover a spawn error from `statusFor()`. Keep `runCommand()`'s `Promise<void>` contract and all its current transcript, notification and disablement effects for existing callers.
- `SystemShellManager` is a server manager registered in `Managers`, constructed after its `plugins` and `pty` dependencies exist, and disposed before both. It owns the shared in-flight ensure promise and a disposed guard. Concurrent calls share that promise; clear it after either outcome so a later call can retry. Disposal prevents a new launch and waits for an in-flight attempt before its plugin and PTY dependencies are disposed.
- Open through the guarded shell plugin command `shell --no-workspace`, with the fixed host launch origin labelled `system`. Reuse `PluginFailureOrigin.launch` (`src/plugins/failure.ts:7`) and the fixed-label branch in `resolveLaunchLabel` (`src/plugins/launch-tab-label.ts:19`); this gives the shell plugin the project root, no source tab and no workspace. Do not add a user/plugin bypass to the `system` name gate or spawn zsh from core.
- Return a live canonical managed shell unchanged: identify it only by `systemShell === true`, shell-plugin ownership and the payload PTY id matching the tab's live local terminal. Never infer ownership from a label or title. If a marked system tab exists but its terminal is dead or invalid, report failure without closing, replacing or restarting it; plan 04 owns dead-PTY replacement.
- When no managed system shell exists, validate the newly opened shell by plugin ownership, its actual shell payload and the live PTY registered to its label. Only after validation, mark the tab with the host-owned `systemShell` identity and hide it through `TabManager.userCloseTab()` (`src/tab/manager.ts:174`), which reuses 01's `hideTab` lifecycle and restores focus to `janus`. Do not use tab count or the label alone as evidence. If the attempt itself leaves an invalid shell tab, destructively close only that attempt-owned tab to release its resources; never close a pre-existing tab that merely occupies `system`.
- On a rejected spawn, failed/disabled plugin, missing terminal or invalid newly opened identity, resolve ensure with a failure outcome and call `notifySystemShellStartFailure` once for that attempt. Preserve the plugin's rejection/failure reason; use `the shell plugin opened no valid system shell` when the command completed without producing a valid shell. Do not create a placeholder. A later ensure attempt retries when no tab was created. The notice helper already formats the exact message and supports the no-system-tab case (`src/schedule/system/notices.ts:28`).
- The hidden shell uses the existing retained plugin body from `web/src/MountedViewLayers.tsx:120` and `web/src/plugins/PluginTabLayer.tsx:32`. In `ShellTab`, make the command bar's `autoFocus` conditional on `capabilities.active`; the existing active-only focus effect and `usePluginChordClaims` already gate focus and chords. Do not change chord registration, picker behavior, the client API or add a headless queue consumer. This narrow client change ensures the newly mounted hidden shell cannot steal launch focus from `janus`.

## What already exists (reuse, don't rebuild)

| Piece | Verified seam | Reuse decision |
| --- | --- | --- |
| Startup and remote restore | `src/main.ts:85` (`startServer`), `src/index.ts:62` (`openLaunchShell`), `src/index.ts:70` (`controller.reattachSessions`), `src/controller.ts:33` (`reattachSessions`) | Insert the awaited ensure between the existing calls. Keep the entry caller unchanged and remote restore unconditional and non-awaited. |
| Required launch shell | `src/launch-shell.ts:13` (`openLaunchShell`), `src/plugins/shell/launch-tab.ts:56` (`spawnShell`) | Preserve fatal launch semantics and validate the actual `janus` shell and its live PTY. |
| Guarded result | `src/plugins/host.ts:80` (`runCommand`), `src/plugins/host.ts:137` (`runGuarded`), `src/plugins/invoke.ts:16` (`PluginCallOutcome`) | Add the result-returning companion over the same guard; retain `runCommand` for existing callers. |
| Fixed shell command and terminal | `src/plugins/shell/parse-argument.ts:53` (`workspace`), `src/plugins/shell/shared.ts:9` (`SHELL_PROGRAM`), `src/plugins/shell/spawn-shell.ts:26` (`spawnShell`) | Use `shell --no-workspace`, `/bin/zsh`, project-root cwd and the plugin's own terminal factory. |
| PTY ownership and liveness | `src/pseudoterminal-manager.ts:58` (`isRunning`), `:145` (`terminalIdFor`), `src/tab/openers.ts:140` (`addPluginTab`) | Match the shell payload PTY id to the local registered terminal under the actual tab label. |
| Hidden identity and user-close lifecycle | `src/tab/types.ts:308–310` (`hidden`, `systemShell`), `src/tab/visibility.ts:25` (`hideTab`), `src/tab/user-close.ts:6` (`userCloseTab`) | Reuse the delivered managed identity and hide/reveal selection behavior; do not edit tab lifecycle modules. |
| Startup failure notice | `src/schedule/system/notices.ts:28` (`notifySystemShellStartFailure`), `src/notifications/system-schedule.integration.test.ts:97` (failure before a system tab exists) | Use the completed event, wording, toggle and missing-tab behavior; do not add another notice path. |
| Retained shell client | `web/src/plugins/PluginTabLayer.tsx:32` (`isVisible`, `isActive`), `web/src/plugins/PluginChords.tsx:71` (`usePluginChordClaims`) | Keep one mounted body with `active: false`; change only the shell command bar's unconditional autofocus. |

## File scope

### Production edits

- Server: new `src/system-shell.ts`; `src/{managers,launch-shell,index}.ts`; `src/controller/create-managers.ts`; `src/plugins/host.ts`.
- Client: `web/src/plugins/shell/ShellTab.tsx` only, to gate command-bar `autoFocus` on `capabilities.active`.
- Keep `src/main.ts`, `src/plugins/{command-adapter,failure,invoke,launch-tab-label}.ts`, `src/plugins/shell/{activate,launch-tab,manifest,parse-argument,shared,spawn-shell}.ts`, `src/pseudoterminal-manager.ts`, `src/tab/{types,visibility,user-close,reserved-label}.ts`, and `src/schedule/system/notices.ts` as read-only integration references.

### Tests

- Edit `src/launch-shell.test.ts`, `src/managers.test.ts`, `src/controller/create-managers.test.ts` and `src/plugins/host.test.ts`; add `src/system-shell.test.ts`; extend the real `startServer` caller tests in `src/index.test.ts`.
- In `src/launch-shell.test.ts`, update the fake manager to expose a real-shaped `janus` shell-plugin tab, matching payload PTY id and registered local terminal. Cover a missing/wrong owner, payload/PTY mismatch and dead terminal; a non-empty `tabs` array alone must not pass.
- In `src/system-shell.test.ts`, use a real `TabManager` with deterministic shell-plugin result and PTY fakes. Cover valid creation and hide/focus restoration, returning an existing valid managed tab unchanged, shared concurrent calls, each failure result and the exact preserved reason, one notice per attempt, retry after a failed attempt, cleanup of only an attempt-owned invalid tab, dead-existing-tab non-replacement, and disposal blocking new work. Do not stub the identity or liveness checks being tested.
- In `src/plugins/host.test.ts`, cover completed, rejected, handler-failed, activation-failed and already-disabled results, while keeping the existing `runCommand` success/rejection side-effect tests. The other production `runCommand` callers are `src/plugins/command-adapter.ts:66` and `src/profile/view-tabs.ts:107`; keep both unchanged and verify their existing contract through the scoped server tests.
- In `src/managers.test.ts` and `src/controller/create-managers.test.ts`, pin one registration, construction after plugin/PTy dependencies and disposal before both dependencies.
- In `src/index.test.ts`, assert the caller order: validated `janus`, awaited system ensure, then unconditional `reattachSessions`. Cover a resolved system-shell failure still allowing the server to listen. Use spies at the real `startServer`/manager boundary; keep `reattachSessions()` non-awaited. Run `src/sessions/manager.test.ts:653` (`SessionsManager restoreAll`) unchanged for independent slow/refusing peers.
- In `web/src/plugins/shell/ShellTab.test.tsx`, prove an inactive shell does not autofocus and that an active shell still focuses its command bar. `web/src/MountedViewLayers.test.tsx:655` (“retains a hidden system plugin consumer across repeated hide and focus at unchanged placement”) already proves one hidden body remains mounted, stays inactive, and receives updates; run it unchanged.
- Run `src/plugins/{launch-origin,terminal-refusal}.test.ts` and `src/cli-args.test.ts` unchanged as fixed-label, spawn-refusal and removed-flag regressions. `src/schedule/system/notices.test.ts` and `src/notifications/system-schedule.integration.test.ts` already pin notice wording and no-placeholder delivery; keep them unchanged.

### Specs and documentation

- Update `product/specs/{application-state,cli,shell-tab,tabs}.md` for the second hidden startup shell, its project-root/no-workspace behavior, nonfatal failure and the existing `system` reveal path. Keep `product/specs/notifications.md` unchanged because plan 02 owns the exact notice contract. Keep `product/specs/tab-plugins.md` unchanged because it already describes retained hidden bodies and `active: false`.
- Update `documentation/user-documentation/getting-started/{startup,tabs}.md` and `documentation/user-documentation/command-bar/shell.md` for the hidden startup shell and nonfatal startup failure. Do not document profile behavior or add a CLI flag.

## Ordered changes

1. Add `runCommandResult()` over the existing guarded invocation. Return its actual completion, rejection or failure outcome, including activation and disabled-plugin failures. Preserve all existing effects and keep every existing `runCommand()` caller on its current contract.
2. Register `SystemShellManager` in `Managers`, construct it after plugin and PTY managers, and place its disposal before both dependencies. Implement the shared, retryable ensure attempt through the fixed-origin guarded shell command. Validate PTY identity before setting `systemShell`; then hide using 01's user-close lifecycle.
3. Strengthen `openLaunchShell` to require the actual live `janus` shell and preserve its failure reason. In `src/index.ts`, await system ensure after `janus` succeeds and before the existing unconditional, non-awaited remote reattachment. A system-shell failure outcome does not throw from `startServer`.
4. Make `ShellTab` command-bar autofocus depend on the existing active capability. Keep the retained body and active-only chord behavior unchanged.
5. Add the named server/client tests, update only the named specs and user docs, and run the verification below.

## Tests and verification

Test a normal startup with one visible, focused `janus` shell and exactly one hidden `system` shell whose live local PTY runs `/bin/zsh` at the project root without a workspace. Test fatal `janus` failure separately from nonfatal system failure. For system failure, assert the exact underlying rejection reason reaches one `notifySystemShellStartFailure` call, no placeholder remains, `startServer` still listens, and remote restoration still runs. Cover disabled plugin and invalid payload/PTY identity without deriving the error from plugin status. Concurrent ensure calls share one attempt; after a failure, a later attempt can succeed. A valid existing system shell is returned without opening, focusing or hiding it again; a dead existing system shell is not replaced in this plan.

Run `./scripts/run.mjs check-diff` during implementation. Manual end-to-end check in a scratch project: start Janissary normally, type into `janus` immediately to confirm it retained focus, run `tab focus system` and confirm the revealed shell starts at the project root without a workspace, close it and confirm it hides, then stop and relaunch the same project and confirm exactly one new hidden system shell is created. Run `git diff --check` for the plan change.

## Boundaries

This plan owns initial system-shell ensure, its error result and the minimum launch-focus integration. It does not own system-shell PTY-exit callbacks, generations, dead-PTY replacement, profile capture/relaunch filtering, schedule firing, `execute`, queues, persistence, grammar, or harness postfixes. Plans 04 and 06 own the later PTY lifecycle and profile work. Do not edit profile callers, CLI parsing, the removed `--relaunch` flag, the tab visibility/user-close implementation, or the 02 notice contract. If implementation evidence raises this scope to complexity 7 or above, split it further and alert the orchestrator rather than weakening these boundaries.
