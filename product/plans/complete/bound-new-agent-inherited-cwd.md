# Bound the working directory a new agent inherits

**Complexity: 4/10** — two launch paths each gain one containment check against a bound they already know, using the host's existing `isInsideRoot` helper, plus two spec paragraphs.

## Goal

A new agent starts in its source tab's directory only when that directory lies inside the bound that applies to the new agent. Otherwise it starts where the specs already say it does:

- `agent --no-workspace` starts in the source tab's directory only when the source is local, not workspaced, and its directory is inside the project checkout. Otherwise it starts in the project checkout. An unconfined agent can no longer start inside a workspaced tab's clone, which is deleted under it when that tab closes, or in a remote tab's remote path, or outside the project.
- The ➕ button on a workspaced source keeps the source's directory only when it is inside the source's clone. Otherwise the new agent starts at the root of the clone, which is the only directory its Seatbelt profile allows.

## Approach

This branch changed both paths. `launchAgent` in `src/profile/new-agent.ts` now starts `--no-workspace` agents in `managers.tab.cwdOf(creator.label)` instead of `process.cwd()`, and `newAgentAt` in `src/profile/manager.ts` now starts a workspaced source's new agent in the source's current cwd instead of `creator.workspaceDir`. Both changes are what lets a shell tab's subdirectory carry into a new agent, which the shell-tab spec relies on, so the fix bounds the inherited directory rather than reverting it.

A new module `src/profile/inherited-cwd.ts` holds two pure functions:

- `unconfinedAgentCwd(creator, cwd, launchDir)` returns `cwd` when `creator.remote` and `creator.workspaceDir` are both unset, `cwd` is defined, and `isInsideRoot(launchDir, cwd)` holds; otherwise `launchDir`.
- `workspaceAgentCwd(workspaceDir, cwd)` returns `cwd` when it is defined and `isInsideRoot(workspaceDir, cwd)` holds; otherwise `workspaceDir`.

`isInsideRoot` comes from `src/plugins/files.ts`, which `src/tab/plugin-terminals.ts` already imports from host code, so profile code importing it adds no new kind of dependency. It resolves both paths, so a `..` path is judged on its real location and a sibling such as `/repo-evil` is not inside `/repo`.

The non-workspaced, local ➕ path in `newAgentAt` is unchanged: master already started it in the source's cwd, and it starts an unconfined agent with no bound to enforce. The remote ➕ path is unchanged too, since it uses the remote workspace.

## Implementation steps

1. Add `src/profile/inherited-cwd.ts` with `unconfinedAgentCwd` and `workspaceAgentCwd`.
2. In `src/profile/new-agent.ts`, `launchAgent`'s `!parsed.workspace` branch, use `unconfinedAgentCwd(creator, managers.tab.cwdOf(creator.label), managers.tab.launchDir)`.
3. In `src/profile/manager.ts`, `newAgentAt`'s workspaced branch, use `workspaceAgentCwd(creator.workspaceDir, this.managers.tab.cwdOf(label))`.
4. Update `product/specs/agents.md` and `product/specs/workspaced-agent.md` to say that the source tab's subdirectory is kept when it is inside the allowed bound, and otherwise the documented default is used.

## Tests

In `src/profile/manager.test.ts`:

- `newAgent`: the existing "command source tab" case uses a source cwd inside `/proj`, so it still asserts the inherited directory.
- `newAgent`: a workspaced source running `agent bob --no-workspace` starts the agent in `/proj`, not in the source's clone.
- `newAgent`: a remote source running `agent bob --no-workspace` starts the agent in `/proj`.
- `newAgent`: a local source whose cwd is outside `/proj` starts the agent in `/proj`.
- `newAgentAt`: a workspaced source whose cwd left its clone starts the agent at the clone root, still sharing the workspace.
- The existing "preserves a shell workspace, subdirectory, and offline mode" case keeps passing, pinning that a subdirectory inside the clone is kept.

## Out of scope

- Refusing a non-workspaced source's cwd that happens to sit inside another tab's clone under `.janissary/workspace/`; that directory is inside the project checkout, and the source chose to be there.
- The remote launch path (`agent … on <address>`), which passes the source cwd to the remote host and is not part of this entry.
- User documentation, which does not describe which directory a new agent starts in beyond what the specs already say.
