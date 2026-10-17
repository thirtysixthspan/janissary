# System schedules 04: server-owned system-shell PTY recovery

**Complexity: 6/10**: the server-owned PTY state machine must coordinate authoritative exit ordering, per-tab generation deduplication, guarded plugin replacement, tab-resource release and teardown races.

This extends 03's initial ensure service. It owns recovery from the authoritative server PTY event; plan 05 later carries client-observed exit generations over the existing close path.

## Goal

Replace an exited system shell's PTY in place while retaining the managed tab, queue and placement. Source: `product/plans/ready/add-system-schedules.md`.

## Decisions and dependencies

- Dependencies: completed 01 (hidden-tab lifecycle) and 03 (system-shell manager, initial ensure and guarded plugin result).
- The server PTY-exit event is authoritative and fires after `PseudoterminalManager` removes the PTY. Broadcast the exit id before recovery starts. The manager acts only when that id equals the current managed shell payload's PTY id and the tab is not closing.
- Store the handled PTY id on that tab's `TabRuntime`, never in a label-keyed map, before awaiting replacement. Duplicate exit events cannot trigger a second replacement when the old payload remains after failure. A fresh PTY id is the next generation.
- Extend `SystemShellManager.ensure()` for an existing managed tab with an exited PTY: retry that tab in place through a guarded `restart-terminal` shell-plugin intent. Only `systemShell === true` plus shell-plugin ownership authorizes the intent. The handler verifies the requested id is the current payload id and `terminalRunning` is false; it cannot restart an ordinary shell or a live process.
- For a real system-shell exit, hide the same tab, record the handled id, end its tab-owned harness/unread observers and tab schedules, then replace its terminal with the shell plugin's `updateTab` resource factory. Reuse `updatePluginTab` so the tab keeps its label, position, group, alias, focus, payload identity and `TabRuntime.queue`. The factory makes a fresh project-root PTY and marker nonce, with no workspace, and registers the normal terminal observers.
- Do not use destructive tab cleanup or clear project-level schedules. A replacement failure leaves the system tab hidden with its identity and queue intact, reports the existing system-shell failure notice once for that attempt, and waits for a later explicit `ensure()`; there is no automatic retry loop. A plugin disabled for a real fault stays disabled until restart.
- Shutdown and plugin teardown set the disposed boundary before a pending ensure can spawn. They never schedule recovery. The event handler must also ignore a tab already closing.
- The existing retained shell body reattaches when its payload PTY id changes. Do not add a headless consumer or change the client close/status contract in this plan; plan 05 owns client generation reporting and stale mount-status handling.

## What already exists (reuse, don't rebuild)

| Piece | Verified seam | Reuse decision |
| --- | --- | --- |
| Managed identity and hide | completed 01; `src/tab/visibility.ts`, `src/tab/user-close.ts` | Preserve system identity and hide the existing tab on a real process exit. |
| Initial ensure and guarded result | 03; `src/system-shell.ts`, `src/plugins/host.ts` | Extend the existing single-flight manager and guarded invocation boundary. |
| PTY ownership and resource replacement | `src/pseudoterminal-manager.ts`, `src/tab/openers.ts` (`updatePluginTab`) | Use PTY ids as generations and the normal resource factory; add no second terminal registry. |
| Shell plugin resource lifecycle | `src/plugins/shell/{activate,spawn-shell,shared}.ts` | Keep restart behind the shell plugin and reuse its zsh hooks and spawn factory. |
| Tab-owned observer/timer release | `src/harness/manager.ts`, `src/schedule/manager.ts` | End only the exited shell's observers and tab schedules; preserve project-level owner state. |

## File scope

### Production edits

- Server: `src/system-shell.ts`; `src/tab/types.ts` for the handled exit generation on `TabRuntime`; `src/controller/events.ts`; `src/plugins/host.ts` for system-only restart-intent authorization; `src/plugins/shell/{activate,shared}.ts`; new `src/plugins/shell/restart-terminal.ts`; `src/harness/manager.ts` and `src/schedule/manager.ts` only at their existing tab-release seams.
- Keep `src/tab/openers.ts`, `src/pseudoterminal-manager.ts`, `src/plugins/shell/{manifest,spawn-shell}.ts`, and all client close/status modules as reuse/read-only references unless implementation evidence requires a specifically named edit.

### Tests

- Edit `src/controller/events.test.ts`, `src/plugins/host.test.ts`, `src/plugins/shell/{activate,shared}.test.ts`, `src/harness/manager.test.ts`, and `src/schedule/manager.test.ts` only for the recovery lifecycle seams. Add `src/system-shell-recovery.test.ts` or colocate the cases in `src/system-shell.test.ts` if it stays under the 200-line rule.
- Exercise `src/plugins/{update-tab,teardown}.test.ts`, `src/plugins/shell-capabilities.test.ts`, `src/plugins/terminal-refusal.test.ts`, and `src/sessions/{manager,shell-roundtrip}.test.ts` as existing integration regressions.
- Test server event broadcast-before-recovery, managed identity and generation checks, observer/timer release, queue and placement preservation, replacement failure plus later ensure, disabled plugin, closing tab and shutdown. Client callback/status race coverage belongs to 05.

### Specs and documentation

- Update `product/specs/{application-state,shell-tab,tabs}.md` for actual process exit replacing only the managed shell PTY. Update user shell/tabs documentation to distinguish process replacement from user hide. The client close callback contract follows in 05.

## Ordered changes

1. Add per-tab handled-generation state and a server event handler that validates managed identity, tab state and current PTY id. Broadcast the original exit before starting recovery.
2. Add the shell plugin's guarded restart intent and extend `ensure()` to retry an exited managed shell through `updateTab`'s resource factory.
3. Hide the same tab and release only its shell observers/unread escalation and tab schedules. Preserve tab identity, placement and queue; do not clear project schedules or run destructive tab cleanup.
4. Bound replacement failure to one reported attempt and let a later ensure retry. Make disposed/closing/plugin-disabled states terminal for that recovery attempt.
5. Test the server lifecycle and update the named specs/docs.

## Tests and verification

Test the authoritative exit id after the PTY registry removes it, broadcast ordering, stale and duplicate server events, a mismatched id, a live PTY, non-system tab, and a closing tab. On valid exit, assert the same hidden tab retains its queue, label, alias, group, position and focus while old tab-owned observers/schedules end and a fresh project-root PTY and marker nonce attach. Cover refused replacement followed by explicit ensure, plugin disable and shutdown without resurrection. Confirm project schedules and destructive teardown remain untouched. Run `./scripts/run.mjs check-diff`.

## Boundaries

No client close reason or mount-status generation contract, profile isolation, schedule persistence, queue provenance or new shell consumer. Plan 05 reports client-observed generations through the existing close path; plan 06 handles profile isolation.
