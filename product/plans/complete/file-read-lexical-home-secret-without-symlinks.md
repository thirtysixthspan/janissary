# File read: run the lexical home-secret check without following in-root symlinks

**Complexity: 1/10** — 1 changed line in 1 file, 2 requirements, 2 test scenarios (p=3.21)

Fixes the PR 1992 review finding against the previous fix (`product/plans/complete/file-read-home-secret-before-disk-access.md`): its lexical home-anchored check in `checkLexical` (`src/file-read/read.ts`) tests `resolveExisting(resolved)`, which follows symlinks inside the root before the existence and real-containment steps. An in-root `link` pointing at an existing `~/.ssh/id_rsa` outside the root reports `Secret file` instead of `Outside the workspace`, and a missing `dir/key` under an in-root `dir` symlinked to `~/.ssh` reports `Secret file` instead of `File not found`. Both contradict subplan 3's check order (`product/plans/complete/move-janissarys-acp-tool-loop-3-file-read-reader.md`): the secret rule runs on the lexical path, and a path that is both outside and secret reports `Outside the workspace`.

## Goal

The lexical home-secret check sees the requested path as written, relative to the root's resolved form, so in-root symlinks are only followed at the existence step. Every result the subplan and the previous fix plans document stays the same.

## Approach

In `checkLexical`, test `isUnderHomeSecret(path.join(resolveExisting(root), path.relative(root, resolved)))`. Resolving only the root keeps the cases the previous fix needed: a root given through a symlink (macOS `/var` → `/private/var`) and a root at the target of a symlinked `~/.config`. The relative part is the lexically normalized path, so no in-root symlink is followed. `resolveExisting`, `isUnderHomeSecret`, and the post-realpath checks in `loadBytes` are unchanged, so a secret reached through an in-root symlink whose target exists and lies inside the root is still refused after real containment, and one whose target lies outside the root reports `Outside the workspace` there.

## Implementation steps

1. In `src/file-read/read.ts`, change the last line of `checkLexical` to run `isUnderHomeSecret` on the root's resolved form joined with the root-relative lexical path.

## Tests

In `src/file-read/read.test.ts`, inside `readWorkspaceLines secrets under the home directory`:

- an in-root `link` symlinked to an existing `<home>/.ssh/id_rsa`, root outside the home directory → `Outside the workspace: link.`;
- an in-root `dir` symlinked to an existing empty `<home>/.ssh`, reading missing `dir/key` → `File not found: dir/key.`.

All existing tests keep passing unchanged, including the missing-secret cases under roots at `~/.ssh`, `~/.config`, `~/.local/share` and under a symlinked `~/.config`, `refuses a symlink escaping the root`, and `reports a dangling symlink as missing`.

## Spec

None. `product/specs/` has no spec for the `file read` reader yet; nothing user-visible ships until subplan 5 registers the typed command.

## Out of scope

A secret reached through an in-root symlink whose target is missing. The stat-to-read race. Secrets under names the table does not list.
