# File read: check home-anchored secrets before any disk access

**Complexity: 2/10** — ~10 added lines in 1 file, 3 requirements, 5 test scenarios (p=4.05)

Fixes the PR 1992 review finding against the previous fix (`product/plans/complete/file-read-home-anchored-secret-check.md`): its home-anchored check, `isUnderHomeSecret` in `src/file-read/read.ts`, runs only inside `loadBytes` after `realpathSync` of the requested file succeeds. With a root at `~/.ssh`, `~/.config`, or `~/.local/share`, an existing `id_rsa`, `gh/hosts.yml`, or `opencode/auth.json` reports `Secret file` while a missing one reports `File not found`. That breaks subplan 3's guarantee (`product/plans/complete/move-janissarys-acp-tool-loop-3-file-read-reader.md`) that a missing secret reports `Secret file`, so the reader never reveals whether a secret exists — the same reason the Seatbelt deny answers ENOENT.

## Goal

Every location the home-anchored secret rule covers reports `Secret file: <path>.` whether or not the file exists, before the reader touches the file itself. A missing ordinary file under a root such as `~/.config` keeps reporting `File not found`, and every existing result stays the same.

## Approach

The lexical check cannot realpath a file that does not exist, and neither can it realpath a deny location that does not exist (`~/.config/gh` missing under a symlinked `~/.config`). Both sides are therefore resolved through their deepest existing ancestor: a private `resolveExisting(location)` returns the realpath when the location exists, and otherwise the resolved form of its parent joined with its basename, recursing up to the filesystem root. This replaces `resolveOrSelf`, which only handled the "exists" case and fell back to the literal path.

- `isUnderHomeSecret` resolves the home directory and each deny location with `resolveExisting`, so a missing `~/.config/gh` under a `~/.config` symlinked to `<dotfiles>/config` resolves to `<dotfiles>/config/gh`.
- `checkLexical`, after the existing root-relative `isSecretPath` check, returns `'Secret file'` when `isUnderHomeSecret(resolveExisting(path.resolve(root, requested)))` holds. Resolving the candidate covers a root given through a symlink (such as macOS's `/var` → `/private/var`) as well as the proposal's "root's resolved form joined with the relative path".
- The post-realpath check in `loadBytes` stays: it still catches a secret reached through an in-root symlink. A secret behind an in-root symlink whose target is missing still reports `File not found`, as the subplan's existing rule already accepts.

Only lexical-plus-ancestor resolution is added; the reader still opens nothing before these checks pass (realpath of ancestors reads directory metadata only, as the existing `resolveOrSelf` of deny locations already did). No new imports, and `read.ts` stays well under 200 lines and each function under cognitive complexity 15.

## Implementation steps

1. In `src/file-read/read.ts`, replace `resolveOrSelf` with `resolveExisting(location)` (realpath, or on failure `path.join(resolveExisting(path.dirname(location)), path.basename(location))`, returning the location itself when its parent is itself), and use it for the home directory and the deny locations in `isUnderHomeSecret`.
2. In `checkLexical`, return `'Secret file'` when the root-relative check or `isUnderHomeSecret(resolveExisting(resolved))` matches.

## Tests

In `src/file-read/read.test.ts`, inside `readWorkspaceLines secrets under the home directory`:

- roots `<home>/.ssh`, `<home>/.config`, `<home>/.local/share` created empty, reading missing `id_rsa`, `gh/hosts.yml`, `opencode/auth.json` → `Secret file: <name>.`;
- `<home>/.config` a symlink to an empty `<outside>/dotfiles/config`, root that target, reading missing `gh/hosts.yml` → `Secret file: gh/hosts.yml.`;
- root `<home>/.config`, reading missing `other.txt` → `File not found: other.txt.`.

All existing tests keep passing unchanged.

## Spec

None. `product/specs/` has no spec for the `file read` reader yet; nothing user-visible ships until subplan 5 registers the typed command.

## Out of scope

A secret reached through an in-root symlink whose target is missing. The stat-to-read race. Secrets under names the table does not list.
