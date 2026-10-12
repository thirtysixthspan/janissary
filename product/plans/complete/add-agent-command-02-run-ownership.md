# Add agent run ownership and local leases

**Complexity: 6/10** — Independent run state, borrowed workspace references, caller identity, and awaited teardown require coordinated manager and shutdown changes.

## Goal

Add an independent owner for each agent run and acquire/release its local workspace references without making a tab the owner of execution.

## Decisions and dependencies

The named `add-agent-command-01-resolution.md` prerequisite is not present in `product/plans/draft/` or `product/plans/ready/`; its resolution groundwork already exists in `src/agent/command-parser.ts` (`parseAgentCommand`), `src/agent/task-resolution.ts` (`resolveAgentSnapshot`), and `src/agent/types.ts` (`AgentSnapshot`). Build on those definitions rather than adding a second launch or grant model. Use opaque UUIDs and one owner object per run. A monitor attaches to an owner but does not own it. The first completion, failure, or termination outcome wins and starts cleanup exactly once. Closing the original caller or invalidating its captured tab incarnation aborts the run; remote transport-loss handling belongs to the remote ownership work, not this local-lease stage. Closing a monitor does not abort the run.

## Existing code to reuse

| Existing mechanism | Verified reference | Reuse and required change |
| --- | --- | --- |
| Agent launch snapshot and grants | `src/agent/types.ts:13` (`AgentSnapshot`), `src/agent/task-resolution.ts:95` (`resolveAgentSnapshot`) | Reuse the frozen resolved task/skills/grants; add run identity and lifecycle state in the owner rather than to the snapshot. |
| Workspace provisioning and refs | `src/workspace/manager.ts:31` (`WorkspaceManager.create`), `:93` (`WorkspaceManager.retain`), `:98` (`WorkspaceManager.release`) | Preserve current tab behavior; add a headless lease operation that acquires only tracked borrowed workspaces and rejects unknown directories, because `retain` silently ignores untracked directories and `release` is synchronous/best-effort. |
| Tab identity and close | `src/tab/types.ts:265` (`TabRuntime`), `src/tab/close.ts:30` (`closeQuitsApp`), `src/tab/cleanup.ts:13` (`closeTabResources`) | Capture a stable caller incarnation and add an owner-close notification before both the last-tab exit and ordinary resource cleanup paths. |
| Manager lifecycle | `src/managers.ts:27` (`ManagerLifecycle`), `:79` (`MANAGER_DISPOSE_ORDER`), `src/controller/create-managers.ts:41` (`createManagers`) | Register `agent`, make disposal awaitable, and order it before the services its cleanup calls. |
| Controller and server shutdown | `src/controller.ts:86` (`ControllerCore.shutdown`), `src/index.ts:60` (launch-shell catch), `:120` (`const close`) | Keep `Controller` as dispatcher; await owner cleanup on all server shutdown and startup-failure paths before disposing dependencies or exiting. |

There is no existing general caller-close hook. `Controller` is the dispatcher surface (`ControllerCore` in `src/controller.ts`); put run lifecycle logic under `src/agent/`.

## Proposed changes

Add `src/agent/run.ts`, `src/agent/manager.ts`, and focused lease/cleanup modules. Each `AgentRun` owns its UUID, abort controller, caller label/incarnation, a one-time snapshot of the caller's `TabRuntime.cwd` and `TabRuntime.context`, outcome latch, workspace reference, child/run resource identities, and monitor attachment identity. Never resolve the caller through the active tab index after launch. Use `TabRuntime.incarnation` (`src/tab/types.ts:266`, `incarnation?: string`) to distinguish a caller tab from a later tab reusing its label; initialize it at capture with `randomUUID()` via `tabRuntime` because it is optional and currently assigned lazily by `src/plugins/activity.ts:73` (`incarnationOf`). Follow that module's `node:crypto` import pattern, but do not couple agent ownership to the plugin activity module's private helper. Reject a missing or stale incarnation before starting effects. The manager indexes owners by run ID and exposes explicit lifecycle methods; do not add per-run label-keyed maps.

`WorkspaceManager` (`src/workspace/manager.ts:31`, `WorkspaceManager.create`; `:93`, `WorkspaceManager.retain`; `:98`, `WorkspaceManager.release`; `:86`, `WorkspaceManager.cancel`) currently creates/tracks a clone, increments only an already tracked directory, removes synchronously while suppressing filesystem-removal errors through `removeWorkspace`, and cancels by provisioning name. Add a headless acquire path that rejects a borrowed directory unless the manager already tracks it, plus an agent-specific awaitable release path that reports final-removal errors; keep the existing synchronous best-effort `release` for tabs. Each run releases only the reference it acquired. Keep the existing tab path and its deferred release in `src/tab/cleanup.ts:24` (`tab.workspaceDir`) intact. Register `managers.agent` in `src/managers.ts:31` (`ManagerRegistry`) and `src/controller/create-managers.ts:41` (`createManagers`); update the compile-time completeness check and tests for `MANAGER_DISPOSE_ORDER` in `src/managers.test.ts`.

Make disposal awaitable: widen `ManagerLifecycle.dispose` in `src/managers.ts:27` (`dispose?(): void`) to permit `Promise<void>`, have `ControllerCore.shutdown` in `src/controller.ts:86` await managers sequentially in `MANAGER_DISPOSE_ORDER`, and put `agent` before every dependency its cleanup uses, including ACP, workspace, remote, questions, and tab. Await this shutdown from `RunningServer.close` in `src/index.ts:120` (`const close`) and from the launch-shell startup-failure catch at `src/index.ts:60`. Also ensure a failure while binding/listening after controller creation awaits shutdown. Preserve idempotence if multiple shutdown triggers race; process-exit and signal paths must not exit before the returned shutdown promise settles. Keep the existing last-client grace timer and quit/SIGINT/SIGTERM routes (`src/index.ts:28`, `:129`; `src/main.ts:92`) funneling through that same awaited close.

The caller-close notification must run before `closeTabOp` in `src/tab/close.ts:30` (`closeQuitsApp`) takes its last-tab exit branch or enters `closeTabResources` at `:34`; this covers both ordinary tab removal and the last tab, whose close emits app exit instead of walking tab resources. Route app exit through the awaited server shutdown as well. A monitor close only detaches that monitor and never terminates the owner. Guard late completion and provisioning callbacks by run identity and abort state. Cleanup must be idempotent, attempt every release even if one fails, and release only references acquired by the run, preserving other workspace users. `AgentRunManager.dispose` must finish attempts for all active runs despite an individual cleanup error, so one rejected run cleanup cannot skip later dependency disposal.

## Tests

Add colocated tests under `src/agent/*.test.ts` for headless runs without tabs, distinct concurrent run IDs and isolated state, first-outcome races, caller closure including last-tab exit, monitor closure, stale/recycled caller identity, late provisioning callbacks, borrowed workspace reference safety (tracked workspace and rejected untracked directory), and idempotent cleanup. Extend `src/managers.test.ts` and `src/index.test.ts` to prove awaited shutdown completes agent cleanup before disposing dependencies, including launch-shell failure, listen failure, normal close, and concurrent shutdown calls.

## Verification

Diff-scoped lint, typecheck, and server tests passed after implementation. Focused tests cover owner creation, caller abort, last-tab caller closure, borrowed-reference release, cleanup failure continuation, shutdown ordering, and listener closure waiting for cleanup. Run-level verification is covered by the final integration subplan, which wires the command and ACP execution.

## Out of scope

Do not create ACP sessions, remote leases, command-result attribution, nested child behavior, monitor UI, or tab allocation propagation in this subplan. Do not adopt existing tabs or remove another user's workspace reference.
