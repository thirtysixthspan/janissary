# Refuse a dangling ancestor symlink in the contained mutation-target resolver

**Complexity: 3/10** — ~16 added lines in one file, 5 requirements, 4 test scenarios (p=4.36)

Source: PR #1996 branch backlog (`product/backlog/pull-request.md`), entry "Refuse a dangling symlink in the ancestor walk of the contained mutation-target resolver instead of recording it as a missing folder that passes containment."

`resolveMutationTarget` in `src/file-write/target.ts` walks up from the destination's parent to the nearest existing ancestor, and `findAncestor` treats every `ENOENT` from `realpathSync` as a missing segment. A dangling symlink also produces `ENOENT`, so `<root>/link -> /outside/new` is recorded as the missing segment `link`, checked for containment only as the lexical string `<realRoot>/link/...`, and returned as an accepted `WriteTarget` whose `realPath` is not the real destination. That contradicts the contained-target subplan's rule that an ancestor symlink resolving outside the root refuses with `Outside the workspace`; the only thing keeping `createTargetParents` from following the link out of the workspace is an undocumented detail of Node's recursive `mkdirSync`.

## Goal

The ancestor walk records a segment as missing only when no directory entry exists at that path. An entry that exists but cannot be resolved (a dangling symlink, directly or further along its link chain) stops the walk with a policy refusal before anything is created.

## Approach

- In `findAncestor`, on an `ENOENT` from `realpathSync(candidate)`, consult a new private helper before recursing to the parent. `findAncestor` gains a `realRoot` parameter so the helper can check containment; `resolveBelowRoot` passes it.
- New private helper `danglingEntryRefusal(realRoot, candidate)` returning `string | undefined`:
  - `lstatSync(candidate)`; when it fails with `ENOENT` the entry truly does not exist, so return `undefined` and the walk continues upward as today. Any other `lstatSync` error returns `fileOperationReason(error)`.
  - When `lstatSync` succeeds, the entry exists and the `ENOENT` came from its link chain. Resolve its `readlinkSync` text against the real path of the link's directory (`realpathSync(path.dirname(candidate))`), wrapped in `runFileOperation` so a failure (including `EINVAL` for a non-symlink entry) returns its `fileOperationReason` text.
  - Return `checkRealTarget(realRoot, linkTarget)` when it fails (`Outside the workspace`, or `Secret file` for a link aimed at a secret path), and otherwise `Not a text file`, matching how `followSymlink` already treats a dangling final symlink.
- Every filesystem call stays wrapped; nothing throws. The helper keeps `findAncestor` under the cognitive-complexity limit, and `target.ts` stays well under the 200-line limit (about 140 lines after the change), so no extraction into a new module is needed.

## Implementation steps

1. `src/file-write/target.ts`: import `readlinkSync`; add `danglingEntryRefusal`; thread `realRoot` into `findAncestor` and call the helper on `ENOENT` before recursing.
2. `src/file-write/target.test.ts`: add the tests below under `resolveMutationTarget ancestors`.
3. Run `$janissary/scripts/run.mjs check-diff`.

## Tests

In `src/file-write/target.test.ts`, under `describe('resolveMutationTarget ancestors')`:

- With `symlinkSync(path.join(outside, 'new'), path.join(root, 'link'))`, requests `link/a.txt` and `link/sub/a.txt` both refuse with `Outside the workspace`, and `existsSync(path.join(outside, 'new'))` stays false.
- With a dangling ancestor symlink pointing at a missing path inside the root (`root/link -> root/missing`), `link/a.txt` refuses with `Not a text file`, and `root/missing` is not created.

The existing destination, policy, ancestor, existing-target, and `createTargetParents` tests stay unchanged and must keep passing.

## Spec and documentation

No spec or documentation change: the resolver has no caller yet (the contained-target subplan records no user-visible behavior and no spec update), so this fix changes nothing a user can observe.

## Out of scope

- The concurrent window where an ancestor is swapped for a symlink between resolution and `createTargetParents`; the contained-target subplan already places hostile concurrent filesystem changes out of scope beyond the existing recheck.
- Changing `followSymlink`, `checkExisting`, `createTargetParents`, `src/file-read/policy.ts`, or any caller.
