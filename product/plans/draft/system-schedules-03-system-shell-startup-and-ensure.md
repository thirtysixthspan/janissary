# System schedules 03: system-shell startup and ensure

**Complexity: 5/10**: one server-owned ensure service joins guarded shell launch to ordinary startup, with a focused retained-client visibility check and nonfatal failure reporting. PTY-exit replacement and profile isolation are separate subplans.

This is the initial system-shell service after 01's hidden-tab lifecycle and 02's notice contract. It creates the local shell and gives later firing/execute callers a retryable `ensure()` seam.

## Goal

Create one hidden, unsandboxed zsh system tab beside `janus` on every ordinary application start, without making launch failure fatal. Source: `product/plans/ready/add-system-schedules.md`.

## Decisions and dependencies

- Dependencies: completed 01 (managed identity, hidden placement and user close) and 02 (system-shell failure notice). Reuse their code; do not re-add the `hidden`/`systemShell` fields, reserved label, focus behavior or user-close lifecycle.
- The source plan predates the removal of `--relaunch` at `d21c4211`. Current `src/cli-args.test.ts:59` and `src/index.ts:18` define the baseline: every `startServer` call follows ordinary startup and has no launch-mode property. Do not add or restore a relaunch flag or mode.
- Keep `openLaunchShell` before `controller.reattachSessions`. Validate the actual `janus` shell first, then await `SystemShellManager.ensure()`. A system-shell failure is nonfatal. Keep remote reattachment unconditional and non-awaited; remote tabs may arrive later and must not be adopted as system shells or cause a duplicate.
- Register `SystemShellManager` in `Managers`. It owns a single in-flight `ensure()` call and a disposed guard, and is disposed before the plugin and PTY managers. Future firing/`execute` callers use this public retry seam. Per-PTY exit generations and recovery are added by 04, not here.
- `ensure()` opens through the guarded shell plugin command `shell --no-workspace`, using a fixed launch origin labelled `system`. Reuse `PluginFailureOrigin.launch` and `resolveLaunchLabel` for the host-only fixed-label exemption, project-root cwd and no source tab. Do not add a user/plugin bypass to the name gate or spawn zsh from core.
- Add `TabPluginHost.runCommandResult()` over the existing guarded invocation so startup can distinguish completion, ordinary rejection and plugin failure. Keep `runCommand()`'s `Promise<void>` contract and its current effects for every existing caller. Preserve the actual rejected-spawn reason; never infer it from an active plugin status.
- Validate `janus` by canonical label, shell-plugin ownership, current payload PTY id and a live registered PTY. Identify an existing managed shell only by `systemShell === true` plus shell-plugin ownership, never by label or title. Validate a newly opened tab by its actual shell payload and live terminal, never by `tabs.length` or label alone; after validation, mark it with the host-owned `systemShell` identity and hide it through 01's visibility lifecycle so `janus` retains focus.
- Concurrent ensure calls share one attempt. A live canonical managed system shell is returned unchanged. When no managed shell exists, open one; on missing terminal, rejected spawn, disabled plugin or invalid opened identity, return a failure outcome, post `notifySystemShellStartFailure` once for the attempt, and create no placeholder. A later `ensure()` retries. Existing dead-PTY replacement is added by 04.
- Reuse 01's retained plugin body. Hidden means no visible terminal, not a second/headless shell consumer. Gate the shell's autofocus, pickers and window chords on `capabilities.active`; keep the ordinary shell and queue mount behavior otherwise unchanged and do not steal launch focus.

## What already exists (reuse, don't rebuild)

| Piece | Verified seam | Reuse decision |
| --- | --- | --- |
| Startup and remote restore | `src/index.ts` (`openLaunchShell`, `controller.reattachSessions`), `src/launch-shell.ts` | Ensure after successful `janus`; keep remote restore unconditional, non-awaited and independent. |
| Fixed shell launch | `src/plugins/shell/launch-tab.ts`, `src/plugins/launch-tab-label.ts`, `src/plugins/failure.ts` | Use the guarded launch command, fixed host launch origin, project root and no-workspace request. |
| PTY creation and marker setup | `src/plugins/shell/spawn-shell.ts`, `src/plugins/shell/shared.ts`, `src/plugins/shell/manifest.ts` | Reuse `/bin/zsh`, `spawnTerminal`, hooks and plugin resource factory. |
| Guarded invocation and result | `src/plugins/host.ts`, `src/plugins/invoke.ts` | Add the result-returning companion over the same guard; keep void callers unchanged. |
| Hidden identity and notice | completed plans 01/02; `src/tab/visibility.ts`; `src/schedule/system/notices.ts` | Use delivered identity/lifecycle and the existing exact startup-failure event. |
| Retained client plugin | `web/src/MountedViewLayers.tsx`, `web/src/plugins/PluginTabLayer.tsx`, `web/src/plugins/shell/ShellTab.tsx` | Keep the existing single retained body and use its active capability to suppress hidden focus behavior. |

## File scope

### Production edits

- Server: new `src/system-shell.ts`; `src/{managers,launch-shell}.ts`; `src/controller/create-managers.ts`; `src/plugins/host.ts`.
- Client: `web/src/plugins/shell/ShellTab.tsx` for conditional command-bar autofocus and closing/suppressing shell-local picker state while inactive. The existing `usePluginChordClaims` active argument in `web/src/plugins/api.ts` is read-only unless a test demonstrates a missing gate; keep any required edit and caller explicit before implementation.
- Keep `src/index.ts`, the remote reattachment path, `src/tab/{visibility,user-close,reserved-label}.ts`, `src/plugins/{failure,invoke,launch-tab-label}.ts`, `src/plugins/shell/{manifest,shared,spawn-shell}.ts`, and `web/src/plugins/api.ts` as read-only integration references unless implementation evidence requires a specifically named edit.

### Tests

- Edit `src/launch-shell.test.ts`, `src/managers.test.ts`, `src/controller/create-managers.test.ts`, and `src/plugins/host.test.ts`; add `src/system-shell.test.ts` and a startup/remote-reattach integration test at the existing `src/index.test.ts` seam.
- Exercise `src/plugins/{launch-origin,terminal-refusal}.test.ts` as read-only guarded-launch regressions. Edit the existing retained-mount tests only where needed to prove one hidden body remains mounted and receives `active: false` without focus listeners.
- Client tests: `web/src/plugins/shell/ShellTab.test.tsx` and the retained `web/src/MountedViewLayers.test.tsx` coverage. Keep frozen plugin fixtures unchanged.
- Keep `src/cli-args.test.ts` unchanged and run it to pin rejection of the removed `--relaunch` option.

### Specs and documentation

- Update `product/specs/{application-state,cli,shell-tab,tabs,tab-plugins}.md` for ordinary startup, nonfatal system-shell failure, retry, hidden focus behavior and remote-restore independence. `product/specs/notifications.md` already owns the failure wording and toggle from 02.
- Update `documentation/user-documentation/getting-started/{startup,tabs}.md` and `documentation/user-documentation/command-bar/shell.md` for the new hidden startup shell. Profile behavior is owned by 06.

## Ordered changes

1. Register `SystemShellManager` and its disposal order, then add `runCommandResult()` over the existing guarded call without changing existing callers.
2. Implement `ensure()` through the guarded fixed-origin shell command. Verify the actual `janus` and system PTYs, mark/hide exactly one managed shell and preserve launch focus.
3. Call ensure after `janus` and before unconditional non-awaited remote reattachment. Keep system-shell failure nonfatal and retryable, with one exact notice per failed attempt.
4. Gate hidden shell autofocus, pickers and window chords on the existing active capability while preserving the single retained body.
5. Add startup, concurrency, failure/retry and asynchronous remote-restore tests; update the named specs and docs.

## Tests and verification

Test first startup and repeated ordinary stop/start against the same project, with one hidden local system shell rooted at the project and no workspace, no duplicate on concurrent ensure, and `janus` focused before the first client connects. Validate the opened shell and live PTY rather than tab count. Cover fatal `janus` failure separately from nonfatal system failure, exact preserved refusal reason and notice, disabled-plugin behavior, and a later successful ensure. Exercise unconditional remote reattachment with empty and seeded stores through a deterministic attach boundary, including slow/refusing peers; remote tabs must not delay local startup or create/adopt another system shell. Confirm a hidden shell body does not steal focus or install active-only listeners. Run `./scripts/run.mjs check-diff`.

## Boundaries

No PTY-exit replacement/generation callbacks, profile capture/relaunch filtering, project schedule storage, runscript grammar, harness postfix policy or independent queue runner. Plan 04 owns server process-exit recovery; plan 05 owns client generation reporting; plan 06 owns profile isolation. The manager's `ensure()` becomes recovery-aware in 04 without changing the initial-start contract established here.
