# System schedules 04: server-owned system-shell PTY recovery

**Complexity: 6/10** — one authoritative server event path must coordinate per-tab PTY generations, guarded plugin replacement, tab-owned resource release and shutdown races across several server modules.

This extends 03's initial ensure service. It owns recovery from the authoritative server PTY event after the PTY registry removes the process. Plan 05 separately reports client-observed generations through its client close/status contract; neither this plan nor 05 uses that route as a substitute for server recovery.

## Goal

Replace an exited system shell's PTY in place while retaining the managed tab, queue and placement. Source: `product/plans/ready/add-system-schedules.md`.

## Decisions and dependencies

- Dependencies: completed 01 (hidden-tab lifecycle) and 03 (system-shell manager, initial ensure and guarded plugin result).
- `PseudoterminalManager.handleExit()` removes the id from its registry before it emits `pty:exit` (`src/pseudoterminal-manager.ts:212–230`, `handleExit`). `wireControllerEvents()` currently broadcasts that exit at `src/controller/events.ts:31–43`; add managed-shell handling there after `sinks.sendPtyExit()` so the client receives the original exit before replacement begins. Do not infer or add a user-close callback route: `TabManager.userCloseTab()` is the explicit user-close path from plan 01, and this plan handles only the PTY event.
- The event handler passes the exited id to `SystemShellManager` only when a current tab is owned by the shell plugin, has `systemShell === true`, its shell payload names that id, and it is not closing. It does not route harness exits, ordinary shell exits, or other plugin exits into system recovery.
- Store the handled PTY id on that tab's `TabRuntime`, never in a label-keyed map, before awaiting replacement. Duplicate exit events cannot trigger a second replacement when the old payload remains after failure. A fresh PTY id is the next generation.
- Extend the manager's existing single-flight `ensure()` path for an existing managed tab with an exited PTY: request replacement through a guarded `restart-terminal` shell-plugin intent. Authorize only a shell-owned tab marked `systemShell === true`. The intent validates that its requested id is the current shell payload id and `terminalRunning` is false; it cannot restart an ordinary shell or a live process. A failed process exit does not retry automatically; a later explicit `ensure()` may retry the hidden tab.
- For a real system-shell exit, hide the same tab and record the handled id before starting the ensure attempt. Let the shell plugin replace its payload using its existing `updateTab` capability and resource factory; `updatePluginTab` preserves the tab record, placement, title, instance key, queue and `TabRuntime`. The factory starts a fresh project-root PTY with no workspace and a fresh marker nonce, and the existing host resource registration installs the normal shell observer.
- Release only resources owned by the exited PTY/tab. `HarnessRuntimes` (`src/harness/runtime-registry.ts:17–31`, exit subscription) releases the shell recording, and `ShellTranscriptManager` (`src/shell/transcript/manager.ts:38–41`, PTY-exit subscription) finishes its text transcript; both do so through the same bus event. Use `ScheduleManager.closeTab(label)` to remove that tab's schedules and hooks. Do not invoke `closeTabResources`, which is destructive and would remove the tab and its payload/file ownership. Do not clear project-level schedules from the later system-schedule owner. The hidden tab retains its identity and queue on failure; report the existing system-shell failure notice once per failed ensure attempt. A plugin disabled for a real fault stays disabled until restart.
- Shutdown and plugin teardown set the disposed boundary before a pending ensure can spawn. They never schedule recovery. The event handler must also ignore a tab already closing.
- The existing retained shell body reattaches when its payload PTY id changes. Do not add a headless consumer or change the client close/status contract in this plan; plan 05 owns client generation reporting and stale mount-status handling.

## What already exists (reuse, don't rebuild)

| Piece | Verified seam | Reuse decision |
| --- | --- | --- |
| Managed identity and hide | completed 01; `src/tab/visibility.ts` (`hideTab`), `src/tab/user-close.ts` (`userCloseTab`) | Reuse `hideTab` for an actual system PTY exit. Do not invoke the user-close path or treat a user close as a PTY-exit callback. |
| Initial ensure and guarded result | 03; `src/system-shell.ts` (`SystemShellManager.ensure`), `src/plugins/host.ts` (`runGuarded`) | Extend the existing single-flight manager and plugin guard, preserving its explicit retry and failure-notice behavior. |
| PTY ownership and resource replacement | `src/pseudoterminal-manager.ts` (`handleExit`, `isRunningFor`), `src/tab/openers.ts` (`updatePluginTab`) | Use the server PTY id as the generation and reuse normal plugin update resources; add no second terminal registry. |
| Shell plugin resource lifecycle | `src/plugins/shell/activate.ts`, `src/plugins/shell/spawn-shell.ts`, `src/plugins/shell/shared.ts` | Keep restart behind the shell plugin and reuse its zsh hooks, payload guard and spawn factory. |
| Tab-owned PTY resources and schedule release | `src/harness/runtime-registry.ts` (PTY exit subscription), `src/shell/transcript/manager.ts` (PTY exit subscription), `src/schedule/manager.ts` (`closeTab`) | Reuse automatic recording/transcript completion and remove only tab-owned schedules/hooks; project-level schedules belong to the later persistent owner. |

## File scope

### Production edits

- Server: `src/system-shell.ts`; `src/tab/types.ts` for the handled server exit id on `TabRuntime`; `src/controller/events.ts`; `src/plugins/host.ts` imports and invokes `authorizeRestartIntent` from the new `src/plugins/restart-intent-authorization.ts` for system-only restart-intent authorization; `src/plugins/shell/{activate,shared}.ts`; new `src/plugins/shell/restart-terminal.ts`; `src/schedule/manager.ts` only if its existing `closeTab` seam needs a narrow change. Keep the restart authorization predicate in its own focused module so the managed-system-shell rule stays cohesive and independently identifiable at the host boundary, rather than adding another concern to the plugin host. `src/harness/runtime-registry.ts` already releases shell observers on PTY exit and should not need production edits.
- Keep `src/tab/openers.ts` and `src/pseudoterminal-manager.ts` as reuse/read-only references: the PTY manager already deletes the id before emitting the event, and `updatePluginTab` already owns replacement. Keep `src/plugins/shell/{manifest,spawn-shell}.ts` and all client close/status modules read-only. No user-close callback or client-reported generation is added here.

### Tests

- Edit `src/controller/events.test.ts`, `src/plugins/host.test.ts`, `src/plugins/shell/activate.test.ts`, and `src/schedule/manager.test.ts` only for recovery-specific event, authorization and tab-schedule release behavior. `src/plugins/host.test.ts` covers restart authorization through `TabPluginHost.intent`; no separate `src/plugins/restart-intent-authorization.test.ts` is needed unless the helper is tested independently. Extend the existing `src/system-shell.test.ts` for manager lifecycle and replacement tests, and `src/shell/transcript/manager.test.ts` only if it needs a regression for natural PTY-exit completion; it currently covers only initial ensure and is already above the 200-line guideline as a test (tests are exempt from `max-lines`).
- Exercise existing `src/plugins/update-tab.test.ts`, `src/plugins/teardown.test.ts`, `src/plugins/shell-capabilities.test.ts`, `src/plugins/terminal-refusal.test.ts`, and `src/sessions/{manager,shell-roundtrip}.test.ts` as integration regressions where relevant. These paths exist in the current tree.
- Test server event broadcast-before-recovery, managed identity and per-tab generation checks, automatic observer release and tab-schedule removal, queue and placement preservation, replacement failure plus later ensure, disabled plugin, closing tab and shutdown. Client-reported generations, close callbacks and mount-status races belong to 05; do not assert or route them in this plan.

### Specs and documentation

- Update `product/specs/{application-state,shell-tab,tabs}.md` for an actual server-observed process exit replacing only the managed shell PTY. Update `documentation/user-documentation/command-bar/shell.md` and `documentation/user-documentation/getting-started/tabs.md` to distinguish process replacement from user hide. Do not describe a client close callback or generation report here; plan 05 owns that contract.

## Ordered changes

1. Add per-tab handled-server-exit state and extend `wireControllerEvents()` to recognize only the current managed shell's matching PTY id. Preserve the existing harness exit branch. Broadcast the original exit before calling recovery, and ignore stale ids, duplicate ids, a closing tab and non-system or non-shell tabs.
2. Add a guarded shell-plugin restart intent that accepts only the current system shell's exited PTY id. Extend `SystemShellManager.ensure()` to replace that tab through `updateTab`'s resource factory; retain the existing one-flight and disposed boundary from plan 03.
3. Hide the same tab and release resources at their current ownership seams: the harness runtime registry releases the shell observer on the PTY event, and `ScheduleManager.closeTab()` clears only that tab's schedules/hooks. Preserve tab identity, placement and queue; do not clear project schedules or run destructive tab cleanup.
4. Bound each replacement attempt to one failure notice and no automatic retry. A later explicit ensure may retry if the plugin remains enabled and the manager is not disposed; closing, shutdown and plugin disable must not resurrect the tab.
5. Test the server event and manager lifecycle, then update the named specs and user docs.

## Tests and verification

Test the authoritative exit id after the PTY registry removes it, broadcast-before-recovery ordering, stale and duplicate server events, mismatched id, a live PTY, non-system tab, non-shell plugin tab and closing tab. Do not model process exit as a `userCloseTab()` call or invoke a close callback. On valid exit, assert the same tab becomes hidden and retains its queue, label, alias, group, position and focus while the exited shell recorder/transcript and tab-owned schedules/hooks end and a fresh project-root PTY and marker nonce attach. Cover replacement refusal/failure followed by explicit ensure, plugin disable and shutdown without resurrection. Confirm project-level schedules and destructive `closeTabResources()` teardown remain untouched. Manual end-to-end check in a scratch project: start Janissary, run `tab focus system`, type `exit` in the visible system shell terminal, and confirm the original exit reaches the client before the same tab hides and reappears with a live project-root shell and its queue/placement intact. Restart the app and confirm plan 03 still creates one hidden system shell. Run `./scripts/run.mjs check-diff` and `git diff --check`.

## Boundaries

No client close reason, callback route, client-reported generation or mount-status generation contract; those are plan 05's separate work through its specified existing close path. No profile isolation, schedule persistence, queue provenance or new shell consumer. Plan 06 handles profile isolation. The server event path in this plan is `pty:exit` from `PseudoterminalManager` through `wireControllerEvents`, not a user-close path.
