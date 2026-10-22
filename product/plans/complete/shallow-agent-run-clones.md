# Shallow agent run clones

Issue: make agent run clones shallow at depth 10 too.

Complexity rating: 2/10

## Goal

`shallow-workspace-clones` and `shallow-remote-workspace-clones` made shell and harness workspaces shallow, on this machine and on a remote host. `agent execute` still makes a full clone in the one case where it creates a workspace of its own: a run that has no workspace to borrow. Make that clone ten commits deep on every branch, the same as a harness, both locally and on a remote host.

## Approach

`src/workspace/clone-depth.ts` gains `AGENT_CLONE_DEPTH`, defined as `HARNESS_CLONE_DEPTH`. An agent run reads and changes code the way a harness session does, so it gets the same history. The module comment is updated to name agent runs.

- Local: `prepareAgentWorkspace` (`src/agent/workspace-execution.ts`) creates its `agent-<uuid>` clone with `workspaceCloneOptions(AGENT_CLONE_DEPTH)`. A run that borrows a named workspace or the caller's own is unchanged. It clones nothing.
- Remote: a run-only connection (`src/agent/remote-target.ts`) passes `depth: AGENT_CLONE_DEPTH` beside `nonInteractive: true` in `RemoteManager.create`'s options. The entry factory already puts the depth on the `provision` frame. A run that borrows an established remote workspace is unchanged.

The `provision` frame's `depth` field and protocol version 35 already exist, so there's no wire or version change.

## Implementation steps

1. `src/workspace/clone-depth.ts`: add `AGENT_CLONE_DEPTH` and update the comment.
2. `src/agent/workspace-execution.ts`: clone with `workspaceCloneOptions(AGENT_CLONE_DEPTH)`.
3. `src/agent/remote-target.ts`: pass `depth: AGENT_CLONE_DEPTH` in the run-only connection's create options.
4. `ai/tasks/workspace/prepare-workspace.md`: the shallow-clone note names agent runs, which get ten commits like a harness. Agent runs execute tasks that run this preparation step, so the note applies to them.

## Tests

- `src/commands/agent.test.ts`: "runs headlessly and returns the structured result after cleanup" expects `workspace.create` to be called with `{ depth: 10, allBranches: true }` as its third argument. The five run-only remote assertions expect `{ nonInteractive: true, depth: 10 }` as `remote.create`'s options.

## Out of scope

- Borrowed workspaces, local or remote. Their depth is whatever their owning shell or harness cloned.

## Specs and docs

- `product/specs/agent-command.md`: a run's own fresh clone, local or over a run-only connection, holds the newest ten commits of each branch.
- `product/specs/remote-server.md`: the version-35 paragraph no longer says a remote agent run sends no depth.
- `help.md` and `documentation/user-documentation/`: checked; neither documents how much history a clone holds, so no update.
