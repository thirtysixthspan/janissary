# Shallow workspace clones

Issue: git clone for shell sessions should be shallow at depth 1. git clone for harness sessions should also be somewhat shallow at 10. update the prepare-workspace task to note the depth of the git repository clone and that older repository history can be obtained with `git fetch --unshallow` for research and debuggiong purposes.

Complexity rating: 2/10

## Goal

A workspace clone today copies the project's whole history, so a typed `shell` or `harness` on a large repository waits for every commit ever made before it starts. Make the local workspace clones shallow: a shell's workspace takes only the newest commit (`--depth=1`), and a harness's takes the newest ten (`--depth=10`), enough for an agent to read recent changes. Tell agents working in a workspace how deep their clone is and how to fetch the rest with `git fetch --unshallow` when research or debugging needs older history.

## Approach

`startGitClone` (`src/git/clone.ts`) already accepts `depth`, and `WorkspaceManager.create` already forwards clone options to it (the git-sync clone uses `{ depth: 1, sparseDirectories: ['product'] }`). The two local workspace launch paths simply don't pass any.

A bare `--depth` also implies `--single-branch`, which would narrow the clone's fetch refspec to the default branch. Then `git branch -r` would list only `origin/master`, `git checkout <other-branch>` would stop finding the remote branch, and `git fetch --unshallow` would deepen only the default branch. Workspace clones should keep seeing every branch, as they do today, with only the history shortened. So `GitCloneOptions` gains an `allBranches` flag that adds `--no-single-branch`, which fetches the newest commits of every branch to the given depth.

Both clone settings live together in one new module, `src/workspace/clone-depth.ts`, with a short comment saying why each depth was chosen and that `git fetch --unshallow` restores full history:

- `SHELL_WORKSPACE_CLONE = { depth: 1, allBranches: true }`, used by the plugin `launchTab` capability's clone (`startClone` in `src/plugins/launch-tab.ts`). The shell plugin is the only plugin that asks `launchTab` for a workspace.
- `HARNESS_WORKSPACE_CLONE = { depth: 10, allBranches: true }`, used by `resolveLaunchDir` in `src/harness/launch-dir.ts`. That path serves both `harness <name>` and a profile's harness entries.

The git-sync clone keeps its own depth-1, single-branch, sparse options unchanged.

The issue also asks for a note in `ai/tasks/workspace/prepare-workspace.md`. That file is outside this task's usual source, test, spec, and docs set, but the issue names it directly, so it's in scope here. The note goes in Step 1, beside `git pull origin master`. It says a Janissary workspace clone is shallow (depth 1 for a shell, depth 10 for a harness, every branch present), that `git rev-parse --is-shallow-repository` tells you whether the current checkout is one, and that `git fetch --unshallow` fetches the rest of the history when research or debugging needs it (`git log`, `git blame`, or `git bisect` past the cut-off).

## Implementation steps

1. `src/git/clone.ts`: add `allBranches?: boolean` to `GitCloneOptions`; `cloneCommand` adds `--no-single-branch` to the clone options when it is true.
2. Add `src/workspace/clone-depth.ts` exporting `SHELL_WORKSPACE_CLONE` and `HARNESS_WORKSPACE_CLONE`, typed `Omit<GitCloneOptions, 'githubToken'>` to match `WorkspaceManager.create`'s third parameter.
3. `src/plugins/launch-tab.ts`: `startClone` calls `managers.workspace.create(label, undefined, SHELL_WORKSPACE_CLONE)`.
4. `src/harness/launch-dir.ts`: `resolveLaunchDir` calls `managers.workspace.create(label, undefined, HARNESS_WORKSPACE_CLONE)`.
5. `ai/tasks/workspace/prepare-workspace.md`: add the shallow-clone note to Step 1.

## Tests

- `src/git/clone.test.ts`: the seed repository gains a second branch. A new test clones `file://<bare>` with `{ depth: 1, allBranches: true }` and checks that the spawned args carry `--depth=1` and `--no-single-branch`, that the clone is shallow (`git rev-parse --is-shallow-repository` is `true`), and that the second branch's remote-tracking ref exists. The existing depth-1 sparse test gains an assertion that its args carry no `--no-single-branch`, which pins the flag to `allBranches`.
- `src/harness/launch-dir.test.ts`: "names the clone under the label it was given" now expects `create` to be called with `('bot', undefined, { depth: 10, allBranches: true })`.
- `src/plugins/launch-tab.test.ts`: "places a busy tab owning its clone before the clone lands" also expects `managers.workspace.create` to be called with `('docs', undefined, { depth: 1, allBranches: true })`.

## Out of scope

- Remote workspaces (`shell … on <address>`, `harness … on <address>`). The remote host clones them in `provisionRemoteWorkspace`, and it doesn't know whether a shell or a harness asked. Passing a depth would mean adding a field to the `provision` frame that both installations have to understand, which is a cross-machine protocol change rather than a launch-path setting. They keep full history.
- The git-sync clone, which is already depth 1 and sparse.
- An origin that is a plain local path. Git ignores `--depth` for a local-path clone and makes a full one, which is git's own behavior and harmless.
- Research playbooks that read file history (`git log -1 -- <file>` in `find-bugs.md`, for example). The prepare-workspace note tells agents to unshallow first; changing each playbook is a separate change.

## Specs and docs

- `product/specs/workspaced-agent.md`: "Workspace creation" says a local workspace clone is shallow (newest commit for a shell, newest ten for a harness), keeps every branch, and can be deepened with `git fetch --unshallow`. "Remote workspaces" says a remote clone keeps full history.
- `product/specs/shell-tab.md`: the typed-`shell` paragraph's "a fresh `git clone`" says it is shallow at depth 1.
- `product/specs/harness.md`: "Workspace default and opt-out" no longer says "identically to `shell --workspace`" without qualification; it says a harness clone keeps the newest ten commits.
- `help.md` and `documentation/user-documentation/`: checked; neither documents how much history a clone holds, so no update.
