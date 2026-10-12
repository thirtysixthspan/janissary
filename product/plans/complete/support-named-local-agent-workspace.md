# Support named local workspaces for agent runs

**Complexity: 6/10** — Resolve named workspace ownership across command routing, provisioning races, and reference cleanup without changing remote workspace selection.

## Goal

Allow a local caller to use `in workspace <label>` to borrow a different existing tracked local workspace, preserving fresh-workspace default behavior when the clause is absent.

## Approach

Use the existing local workspace manager as the authority for which clones are tracked. Associate local workspace names with their managed directories, expose a borrow operation that returns the directory, readiness promise, and one idempotent run-owned release, and reject missing or untracked names. A borrowed workspace may still be provisioning; the run waits for its existing readiness promise without cancelling another tab's creation. Keep remote workspace selection and `on <host>` handling unchanged.

## Implementation steps

1. Extend `WorkspaceManager` to resolve and retain an explicitly named tracked local workspace, preserve the name mapping while references remain, and remove it only after successful final deletion.
2. Pass the named local workspace through the local agent launch path. Resolve its task and skills only after readiness, and use the selected directory as the ACP cwd and confinement root. Do not fall back to a fresh clone when an explicit name is unknown or untracked.
3. Preserve existing remote routing: a remote workspace selector continues to resolve through its established remote tab, while local callers may resolve a tracked local workspace name.
4. Update the behavior spec and user guide to describe selection, errors, readiness, and reference release.

## Tests

Cover a successful explicitly named local borrow, missing and untracked names, a selected workspace still provisioning, and preservation of other tab/run references. Exercise agent completion, provider failure, and caller termination to verify the selected workspace lease is released once. Preserve fresh workspace creation when no selector is supplied and all existing remote workspace host-selection cases.

## Verification

The diff-scoped lint, typecheck, and server tests passed after the implementation changes. The agent-command guide and behavior spec describe named local selection separately from remote workspace selection.

## Out of scope

Do not change default fresh-workspace creation, workspace cloning, remote host selection, remote workspace lookup, or execution-host task/skill resolution. Do not borrow untracked directories or release another holder's reference.
