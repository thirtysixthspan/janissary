# Refuse host-tool writes and edits inside .janissary and .git

**Complexity: 5/10** — 7 requirements and 14 test scenarios over ~25 added lines in 2 production files (p=5.25)

## Goal

The `file write` and `file edit` host tools refuse any target inside a `.janissary` or `.git` directory under the workspace root, so a `tell` agent (or a typed mutation) can no longer rewrite the role grants and command settings that are this feature's only enforcement (`.janissary/roles.json`, `.janissary/commands.json`) or plant git hooks and config (`.git/hooks/*`, `.git/config`) that git later executes outside any sandbox. The refusal is mutation-only: `file read` of the same paths is unchanged, and editor saves (which do not use the tool-write policy) are unchanged.

## Approach

Add a protected-path check to the shared file policy in `src/file-read/policy.ts`, exported for the writer only; the reader never calls it. A root-relative path is protected when any of its segments, compared case-insensitively, is `.janissary` or `.git`. Matching any segment rather than only the first also covers nested repositories and submodule checkouts inside the workspace, whose hooks git runs just the same, and matches how the secret check already matches segment runs anywhere in the path. The refusal word is a new `FilePolicyFailure`, `Protected file`, which `src/file-write/outcome.ts` already prints as `Protected file: <path>.` through its generic `<reason>: <path>.` branch.

`src/file-write/target.ts` applies it at every point where it already applies the containment and secret checks, through one local helper that runs `checkRealTarget` and then the protected check on the path relative to the real root:

- on the lexical requested path in `resolveMutationTarget`, before any I/O;
- on the real nearest existing ancestor and the lexical destination in `resolveBelowRoot` (via `checkContainedPaths`), which runs before `createTargetParents` creates any folder, so no missing parent is ever created inside a protected directory;
- on the real target of a symlinked file (`followSymlink`) and the link target of a dangling symlink in the ancestor chain (`danglingEntryRefusal`), so a symlink inside the root that aliases `.git`, `.git/hooks`, `.janissary`, or a file inside them is refused the same way;
- on the post-creation recheck in `recheckDestination`.

Because `writeToolTextFile` (`src/file-write/filesystem.ts`) and `editToolTextFile` (`src/file-write/edit.ts`) both resolve through `target.ts`, and those helpers run on the machine that owns the workspace, the check covers typed commands, the local ACP route, the remote-hosted loop, and the far side of the remote `write-file` (`policy: 'tool-text'`) and `edit-file` operations without any protocol change. Hard links are not a bypass: the writer replaces the target atomically by rename, so it never writes through a hard link into a protected file.

## Implementation steps

1. In `src/file-read/policy.ts`, add `'Protected file'` to `FilePolicyFailure` and export `checkProtectedPath(relative)` that returns `'Protected file'` when any `path.sep`-separated segment, lowercased, is `.janissary` or `.git`, with a short comment above it stating that it is mutation-only and the reader never calls it.
2. In `src/file-write/target.ts`, add a private `checkMutablePath(realRoot, realPath)` composing `checkRealTarget` and `checkProtectedPath(path.relative(realRoot, realPath))`; use it in place of `checkRealTarget` in `danglingEntryRefusal`, `followSymlink`, and `checkContainedPaths`, and call `checkProtectedPath` on the lexical relative path in `resolveMutationTarget` after `checkLexicalPath`.
3. Update specs and docs (below), and the parent plan's design decisions.

## Tests

- `src/file-read/policy.test.ts`: `checkProtectedPath` refuses `.git/config`, `.git/hooks/pre-commit`, `.janissary/roles.json`, `.JANISSARY/commands.json`, `.Git/HEAD`, and a nested `vendor/lib/.git/hooks/x`; allows `src/a.ts`, `.github/workflows/ci.yml`, `.gitignore`, and `docs/janissary.md`.
- `src/file-write/target.test.ts`: lexical refusals for `.janissary/roles.json`, `.janissary/commands.json`, `.git/config`, `.git/hooks/pre-commit`, and a case-varied `.GIT/config`; a directory symlink inside the root aliasing `.git/hooks` and one aliasing `.janissary` are refused; a file symlink aliasing `.git/config` is refused; a dangling ancestor symlink pointing into `.git` is refused; a new nested path under `.git/hooks/new/` and under a symlink alias to `.git` creates no folder; `.github/` and `.gitignore` still resolve.
- `src/file-write/filesystem.test.ts`: `writeToolTextFile` refuses `.janissary/roles.json` and `.git/hooks/pre-commit` (missing `hooks` folder), leaving the existing roles file byte-identical and creating nothing.
- `src/file-write/edit.test.ts`: `editToolTextFile` refuses `.janissary/commands.json` and `.git/config` and through a symlink alias, leaving the files unchanged.
- `src/remote/serve-file-navigator.test.ts`: a far-side tool-text `write-file` to `.git/hooks/pre-commit` and an `edit-file` on `.janissary/roles.json` are refused with `Protected file`, nothing created or changed, while an ordinary editor `write-file` (no policy) to `.janissary/roles.json` still succeeds and a far-side `read-lines` of it still reads.
- `src/file-write/outcome.test.ts`: `Protected file` prints as `Protected file: <path>.`.
- `src/file-read/read.test.ts` is unchanged and must keep passing; reads of these paths keep working.
- Run `$janissary/scripts/run.mjs check-diff` after each step.

## Specs and documentation

- `product/specs/acp.md`: in the typed write/edit and the write/edit tool sections, state that targets inside `.janissary` or `.git` are refused with `Protected file: <path>.`, including through symlinks and before any folder is created, and that reads are unaffected.
- `help/file.md`: add the `Protected file: <path>.` failure line with its reason.
- `product/plans/complete/janissary-hosted-agent-write-tool.md`: add a design decision naming the protected directories and why.

## Out of scope

- Other self-referential or executable control files outside those two directories, such as a project's harness configuration or `~/.janissary`, which is outside the workspace root and already refused there.
- Editor saves, file-navigator operations, and `file read`, which keep their current behavior.
- A setting to opt out of the protection; a user who wants these files changed edits them by hand or in the editor.
- The stat-to-rename race window the parent plan already leaves out of scope.
