# Borrow the project's own objects when cloning a workspace

**Complexity: 3/10** — one new clone option and one argument at the single place a workspace clone starts. The clone still fetches from `origin` and still lands as a standalone repository.

## Bug

Workspace cloning takes too long, 30–40 seconds.

## Root cause

Every workspace clone (`WorkspaceManager.create` → `provisionWorkspace` → `startGitClone`) runs `git clone --depth=N --no-single-branch -- <origin> <target>` and downloads every object it needs over the network. The repository's tree is about 80 MB, mostly the PNG sprites under `agent-images/`, and a depth-1 or depth-10 clone fetches a pack of about 67 MiB. The project checkout the clone is made from already holds nearly all of those objects on disk, and the clone ignores them. So clone time is set by network throughput, and it grows with every clone running at the same time.

## Correct behavior

A workspace clone still fetches from the project root's `origin` and lands with the same branches, depth, and remote setup. But it takes any object the project's own repository already has from local disk, and downloads only what is missing. The finished clone must not depend on the project repository afterwards. If the project repository can't lend its objects (for example, it is itself shallow), the clone downloads everything as it does today.

## Reproduction

- `temp/time-provision.ts` (throwaway) called `provisionWorkspace` against `https://github.com/thirtysixthspan/janissary.git` with the harness clone options. One clone took 6.4s at depth 10 and 8.8s at depth 1. Three concurrent clones took 16.7s, 18.4s, and 20.6s, each downloading the full ~67 MiB pack.
- The same depth-10 clone with `--reference-if-able=<local full clone> --dissociate` took 1.8s. The result was shallow, and had no `objects/info/alternates`.
- A shallow repository given as the reference is skipped with an `info: Could not add alternate … is shallow` line on stderr, and the clone still succeeds over the network (11.2s).
- The 30–40s in the report was not observed in this environment. The measured clone time is network-bound and roughly scales with concurrent clones, which explains the reported range.

## Approach

1. `GitCloneOptions` gains `reference?: string`, a local repository to borrow objects from. `cloneCommand` adds `--reference-if-able=<path>` and `--dissociate`. `--dissociate` copies the borrowed objects into the clone once it lands, so deleting or changing the project repository never breaks a workspace. The reference is left out for a sparse clone (the git-sync clone, already blob-less) and for a shallow repository, whose stderr `info:` line would otherwise become the reported first error line of a failed clone.
2. `WorkspaceManager` already resolves the project's repository root to read `origin`. `create` passes that root as `reference`, so every local and remote workspace clone borrows from the repository whose `origin` it clones.

## Implementation steps

1. Add `reference` to `GitCloneOptions` and its arguments in `src/git/clone.ts`.
2. Return the repository root alongside the `origin` URL in `WorkspaceManager.originUrl` and pass it as `reference` from `create` in `src/workspace/manager.ts`.
3. Update `product/specs/workspaced-agent.md`, where it describes the clone.

## Regression test

- `src/git/clone.test.ts`: a clone given a full local repository as `reference` passes `--reference-if-able=<path>` and `--dissociate`, lands with every branch, and has no `objects/info/alternates`. A shallow reference and a sparse clone pass no reference arguments.
- `src/workspace/manager.test.ts`: `create` passes the repository root as `reference`.

## Verification

- `check-diff` passes.
- Rerun `temp/time-provision.ts` with the project root as reference and compare its time against the earlier runs.
- Live end to end: build and start a scratch instance and open a `shell` workspace through the driver. The expected result is the `Prepared workspace … in Xs.` notification, with X well under the network-only time. The live check is possible only if the scratch instance can start and has an attached browser.

Results: with a full local reference, the clone took 2.1s at depth 10 (was 6.4s) and 2.9s at depth 1 (was 8.8s). Three concurrent clones took 1.9–2.4s (were 16.7–20.6s). In the live check, the scratch project was a full clone with a GitHub `origin`, and `shell clonecheck` posted `Prepared workspace $workspace/clonecheck in 3.1s.`

## Out of scope

- Shrinking the repository (moving `agent-images/` out of the tree).
- Cloning from the local checkout instead of `origin`, which would give stale branches.
