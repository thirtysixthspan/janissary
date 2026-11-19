# Model search 9: The launch dialog's view carries the roles' model entries

**Complexity: 3/10** — ~20 added lines, 2 files edited, 5 requirements, 4 test scenarios (p=4.57)

Run order: 9 of 11 in the model search series. Source plan: `product/plans/complete/roles-model-search-input.md`. Depends on no earlier subplan's code. It runs after `product/plans/ready/roles-model-search-input-8-roles-return-adds.md` by series order, and subplan 11 consumes it.

The New harness dialog's blank model input will list the models the existing roles use most, the same ranking the roles picker uses. The dialog has no roles data today, so the server has to deliver the entries it counts from. This step adds a required `roleEntries` field to `HarnessLaunchView`, read once when the dialog opens. The client ignores the field until subplan 11.

## Goal

Add `roleEntries` to `HarnessLaunchView` in `src/protocol/tab.ts`, fill it in `HarnessManager`, update the fixtures that build a complete view, and test the server side.

## Design decisions

All of these come from the source plan.

- **The dialog receives raw role entries and ranks on the client (user decision).** `HarnessLaunchView` gains a required `roleEntries` field: one list of `{ harness, model }` pairs per role, in the file's role order and each role's entry order. Document it at the field as the roles in effect, read when the dialog opened. The ranking stays the single client function from subplan 1, `mostUsedModels`, which serves both hosts. The pairs carry no `effort`.
- **Read without creating a file.** `openLaunchDialog()` reads the roles with `readRolesFile(homedir(), this.managers.tab.launchDir, { create: false })` from `src/plugins/roles/roles-file.ts`, the reader `src/acp/ask-role.ts` uses with the root `src/subagent/command-policy.ts` passes (`managers.tab.launchDir`). It never creates a file. With no roles file it yields the built-in default roles (`DEFAULT_ROLES`). A broken file falls back along the reader's existing chain, and its problem line isn't shown anywhere in the dialog.
- **The import is allowed.** Import from `../plugins/roles/roles-file.js`, as `src/acp/ask-role.ts` does. Core may import a plugin's file module; the boundary rule in `eslint.plugin-boundaries.mjs` only forbids reaching a plugin's `activate.js`. `homedir` comes from `node:os`.
- **Read once per open (user decision).** `openLaunchDialog()` reads the roles once and keeps only the `{ harness, model }` pairs in a private field beside `launchDialogOpen`. Every `harnessLaunchView()` built while that dialog stays open returns them, and `closeLaunchDialog()` drops them. So a roles edit made while the dialog is open first appears the next time it opens. The catalog half of the view (`names`, `models`, `autoApprove`, `autoResume`) is still built fresh for every snapshot, as today, so a model enabled or disabled while the dialog is open still reaches it.
- **A deliberate ceiling.** Reading once per open is the chosen behavior. If live updates are ever wanted, the upgrade path is to re-read in `harnessLaunchView()` behind an mtime check. Record that in a short comment at the read.
- **Acquire and release together (`ai/guidelines/architecture-principles.md` §6).** The entries are set only in `openLaunchDialog()` and cleared only in `closeLaunchDialog()`. They are dialog state on the manager, like the existing `launchDialogOpen` flag, not per-tab state.
- **Fixtures move with the field.** Because the field is required, every literal that builds a complete `HarnessLaunchView` gains `roleEntries: []` in the same change, so typecheck stays green. `web/src/shared/ws/ws.ts` passes the view through without validating it, so nothing else changes there.

## What already exists (reuse, don't rebuild)

| Need | Existing code | Notes |
| --- | --- | --- |
| The view type | `HarnessLaunchView` at `src/protocol/tab.ts:54` | Re-exported to the client through `@shared/protocol` (`src/protocol.ts:133`) |
| Building the view | `openLaunchDialog()` (`src/harness/manager.ts:81`), `closeLaunchDialog()` (`:87`), `harnessLaunchView()` (`:95`) | Rebuilt on every state snapshot (`src/state/event.ts:18`); the file is 163 lines, so a few added lines stay under `max-lines` |
| Reading roles from core | `readRolesFile(home, root, { create: false })` at `src/plugins/roles/roles-file.ts:181`, used by `readRoleSettings` at `src/acp/ask-role.ts:60` | Falls back project → home → defaults (`DEFAULT_ROLES`, `src/plugins/roles/roles-file.ts:27`) |
| Writing a roles file in tests | `writeRolesFile(path, roles)` at `src/plugins/roles/roles-file.ts:220` | Writes the project file the project-entry case reads |
| The launch root | `managers.tab.launchDir` (`src/tab/manager.ts:37`), as `src/subagent/command-policy.ts:53` passes it | |
| HOME isolation in tests | `vi.stubEnv('HOME', …)`, as in `src/harness/transcript/sources.test.ts` and `src/controller/create-managers.test.ts` | `os.homedir()` reads `HOME` on POSIX |

## Proposed changes

- `src/protocol/tab.ts`: `HarnessLaunchView` gains the required `roleEntries` field, an array (one per role) of arrays of `{ harness: string; model: string }`, with a comment saying it holds the roles in effect when the dialog opened.
- `src/harness/manager.ts`:
  - `openLaunchDialog()` reads the roles as above, maps each role's entries to `{ harness, model }` pairs, and stores the result before emitting the dirty state.
  - `harnessLaunchView()` returns the stored pairs as `roleEntries` alongside the freshly built catalog.
  - `closeLaunchDialog()` clears them.
  - The additions keep the file well under the 200-line limit.
- Fixtures that build a complete view gain `roleEntries: []`:
  - `web/src/useServerState.test.ts`, the `harnessLaunch: { names: ['claude'], … }` literal.
  - `web/src/shared/ws/ws.test.ts`, the literal that carries `autoResume: []`. The two `ws.test.ts` literals that already omit `autoApprove` and `autoResume` exercise partial wire data and stay as they are.
  - `web/src/harness/HarnessLaunchDialog.test.tsx`, the module-level `view: HarnessLaunchView` fixture, which the source plan doesn't list but which is typed as a complete view.
- `src/harness/manager.test.ts`: `makeManagers` gains an optional `launchDir` that the `tab` fake exposes as `tab.launchDir`, pointing at a temporary directory so the read never touches the developer's real project. The `HarnessManager launch dialog view` block owns the temp root: create it in `beforeEach` with `mkdtempSync(path.join(tmpdir(), 'harness-launch-roles-'))`, stub `HOME` to a separate `home` subdirectory of it, and pass a `project` subdirectory as `launchDir` (the other blocks never open the dialog, so their unchanged calls are unaffected). In `afterEach` call `vi.unstubAllEnvs()` and remove the root with `rmSync(..., { recursive: true, force: true })`, exactly as `src/harness/transcript/sources.test.ts:14-31` does — without the unstub, `HOME` leaks into the rest of this file. The project-file case writes `path.join(tab.launchDir, '.janissary', 'roles.json')` with `writeRolesFile`; the read-once case rewrites that same file while the dialog is open.

## Tests

`src/harness/manager.test.ts`, in the `HarnessManager launch dialog view` block, with `HOME` stubbed to a temporary directory so the developer's own `~/.janissary/roles.json` is never read or written:

- `harnessLaunchView()` carries `roleEntries` read from a project `.janissary/roles.json` in the launch dir, in role order and entry order, with no `effort`.
- With no roles file it carries the default roles' entries, and no file is created in either the home or the project directory.
- The entries are read once per open: a change to the file while the dialog is open doesn't appear in later views until the dialog is closed and reopened.
- They are dropped on close: after `closeLaunchDialog()` and a fresh `openLaunchDialog()`, the view reflects the file as it is now.

`src/controller.test.ts` (the 'closeHarnessLaunch RPC closes the open harness launch dialog' case) needs no change: that path reads with `create: false`, so it never writes a file, and the case only asserts the view goes non-null then null — it never inspects `roleEntries` — so its unstubbed `HOME` is harmless and there is no fixture to update.

## Verification

- `$janissary/scripts/run.mjs check-diff`.
- No manual check: the dialog doesn't read the field until subplan 11.

## Out of scope

- Any client use of `roleEntries` (subplan 11).
- Any change to `readRolesFile`, the `roles.json` format, or the roles plugin's server side.
- Re-reading roles while the dialog is open.
