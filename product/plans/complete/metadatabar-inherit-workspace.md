# Metadatabar "new agent here" inherits the creator's workspace

**Complexity: 3/10** — one branch in an existing method, reusing the clone/busy/provisioning machinery `newAgentOp` already implements for `agent --workspace`. No new architecture.

## Goal

When the ➕ ("New agent here") button in the metadatabar (`AgentTabMeta`) launches an agent from a harness tab that is itself workspaced, the new agent tab should get its own cloned workspace too, instead of silently rooting at the workspaced harness's directory with no `workspaceDir` of its own. Today `ProfileManager.newAgentAt` always calls `placeAgent(..., undefined, false)`, ignoring whether the creator tab is workspaced.

## Approach

`newAgentAt` currently only knows the creator's `cwd` (`managers.tab.cwdOf(label)`), not the creator `Tab` object, so it can't see `workspaceDir`. It already looks up `creator` via `this.managers.tab.tabs.find(...)` — that lookup already gives access to `creator.workspaceDir`. Branch on it exactly the way `newAgentOp` (`src/profile/new-agent.ts:23-53`) branches on `parsed.workspace`:

- **Creator not workspaced** (`creator.workspaceDir === undefined`): keep the current behavior — `placeAgent(resolved, creator, cwd, undefined, false)`.
- **Creator workspaced**: call `managers.workspace.create(resolved)`. On `{ error }`, report it via `notify(managers, 'manual', label, error)` (mirrors the existing "all names in use" notify call in this method) and stop — no tab created. On success, `placeAgent(resolved, creator, result.dir, result.dir, false, true)` (busy), then `wireProvisioning(...)` with the same shape as `newAgentOp`: on ready, `deleteBusy` + emit `state dirty` + `notify(managers, 'manual', label, ...)` with the ready message (+ sandbox notice if any); on failure, `notify(...)` the failure message and close the tab after `PROVISION_FAILURE_CLOSE_DELAY_MS`.

`newAgentAt` has no "output" transcript the way `newAgentOp` does (the creator may be a harness tab with no command/output log) — the existing code already solves this by using `notify(this.managers, 'manual', label, ...)` for its one message today, so every new message (ready / workspace error / clone failure) uses `notify` the same way instead of `managers.tab.append`.

## Implementation steps

1. **`src/profile/manager.ts`** — rewrite `newAgentAt` to branch on `creator.workspaceDir`:
   - Keep the existing early returns (`!creator`, `resolved === null`).
   - Non-workspaced creator: unchanged call to `placeAgent`.
   - Workspaced creator: call `managers.workspace.create(resolved)`; handle `{ error }` via `notify`; otherwise `placeAgent(resolved, creator, result.dir, result.dir, false, true)` then `wireProvisioning(resolved, result.ready, tabExists, onReady, onFailed)` with `onReady`/`onFailed` built from `notify`, `sandboxNotice`, `deleteBusy`, `messageBus.emit('state', { type: 'dirty' })`, and the same delayed `closeTab` used in `newAgentOp`.
   - Import `wireProvisioning`, `PROVISION_FAILURE_CLOSE_DELAY_MS` from `../workspace/provision-wire.js`, `sandboxNotice` from `../sandbox/index.js`, and `messageBus` from `../bus.js` (all already imported by `src/profile/new-agent.ts`, confirming availability).
2. Keep `placeAgent` untouched — it already accepts `workspaceDir` and `busy`.
3. Since the workspaced branch duplicates most of `newAgentOp`'s post-`workspace.create` logic, consider extracting a small shared helper (e.g. `provisionWorkspacedAgent` in `new-agent.ts`) taking the resolved name, `cwd`-setter/`placeAgent` callback, and an `out: (text: string) => void` sink — `newAgentOp` passes `out` bound to `managers.tab.append(...)`, `newAgentAt` passes `out` bound to `notify(...)`. Only extract if it keeps both call sites clean; a small amount of duplication is acceptable if extraction would obscure either call site's simpler shape (`newAgentAt` has no error-on-duplicate-name check, no `parsed.offline`).

## Tests

Add to `src/profile/manager.test.ts`, `describe('ProfileManager.newAgentAt', ...)`:

- `creates a workspace when the creator tab is workspaced` — creator `makeTab(..., workspaceDir: '/janus-workspaces/claude')` (or however `makeTab` sets it), `managers.workspace.create` mocked to return `{ dir, ready }`; assert `managers.workspace.create` called with the resolved name, `insertTabInGroup` called with `expect.objectContaining({ workspaceDir: dir })`, `setCwd` called with `dir`, and the tab placed busy.
- `reports the workspace error via notify and creates no tab when the creator is workspaced and cloning fails` — `workspace.create` mocked to return `{ error }`; assert `notify` called with that message and `insertTabInGroup` not called.
- `clears busy and notifies ready once the clone resolves for a workspaced creator` — resolve the `ready` promise; assert `notify` called with the ready message and `deleteBusy` called.
- `does not create a workspace when the creator tab is not workspaced` (existing behavior — extend the existing "creates a new agent tab rooted at the source tab cwd" test or add an explicit assertion that `managers.workspace.create` was not called).

Mirror the mocking style already used in the `ProfileManager.newAgent` describe block above (`vi.mock('../notifications.js', ...)`, `vi.mock('../sandbox/index.js', ...)` already present at the top of the file) and the `makeAtManagers` helper in the `newAgentAt` describe block — extend it with `workspace: { create: vi.fn() }`, `deleteBusy: vi.fn()`, `addBusy: vi.fn()`, `closeTab: vi.fn()` (mirroring `makeManagers` for `newAgent`).

## Spec

Update `product/specs/workspaced-agent.md`, "Workspace agent tab" section — add a short paragraph noting that launching a new agent from the metadatabar's "New agent here" button on a workspaced tab also creates a workspace for the new agent, following the same clone/busy/ready flow as `agent --workspace`.

## Out of scope

- Changing the harness-side "New agent here"/launch button behavior beyond what already routes through `newAgentAt` — `AgentTabBody`/`InactiveAgentTabBody` reuse the same handler, so they inherit the fix for free without separate changes.
- Any UI change to `AgentTabMeta.tsx` — the button's behavior changes, not its markup.
- Offline mode inheritance (`--offline`) — `newAgentAt` has never taken an offline flag; out of scope for this fix.
