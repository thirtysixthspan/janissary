# Symlinks to directories return the one-word directory result for file head and tail

**Complexity: 2/10** — ~20 added lines in 1 production file, 3 requirements, 4 test scenarios (p=4.123)

## Goal

`file head` and `file tail` already return the one-word `notdir` when their target is a directory. A symbolic link that points to a directory must return that same one-word result in both directions, while a symbolic link to a regular file keeps being read normally.

## Background

The pre-read directory check in `src/file-head-tail/tab-head-tail.ts` uses `readRowStat`, which is an `lstat`: a symlink's own mode is `S_IFLNK`, so a link to a directory escapes the check. The read then falls through to `file read`, which emits the verbose `Is a directory: <path>.` line — a different error shape from a real directory. The verbose lines for missing, out-of-workspace, non-text, and oversized files must stay as they are.

## Approach

Extend the existing pre-read check so it resolves a symlink target only after the fast lstat check has identified a symlink. Keep the outer lexical check in place so out-of-workspace and secret paths still reach `file read` unchanged. A resolved target that the policy refuses is left to the normal read path; only a contained target whose stat mode is `S_IFDIR` becomes `notdir`.

## Implementation steps

1. Import `canonicalPath` from `src/file-read/canonical.ts` and add `S_IFLNK` to the destructured `node:fs` constants in `src/file-head-tail/tab-head-tail.ts`.
2. Extract the pre-read directory check into a helper that keeps the lstat fast path, and for a symlink: canonicalize the root and target, re-run `checkLexicalPath` against the resolved location, and stat the resolved path for `S_IFDIR` before returning `fileFailureLine('Is a directory', requested) ?? 'notdir'`. A canonicalization failure returns no failure so the read path reports it.
3. Call the helper from `headTailInTab` inside the existing `checkLexicalPath(root, parsed.path)` guard, returning its one-word result when present.
4. Run `$janissary/scripts/run.mjs check-diff`.

## Tests

- `src/file-head-tail/tab-head-tail.test.ts` — a symlink to a directory asserts `notdir` for both `head` and `tail`.
- `src/file-head-tail/tab-head-tail.test.ts` — a symlink to a regular file is still read, asserting numbered output in both directions.
- Existing verbose-line tests and parser tests stay unchanged.

## Out of scope

- No changes to `file read` itself, to `file read`'s verbose messages, or to the path policy helpers.
- No remote tabs, dispatcher wiring, completion, native-command registration, help pages, or documentation beyond the functional spec.
- No change to how missing, out-of-workspace, secret, non-text, or oversized files are reported.

## Verification

`$janissary/scripts/run.mjs check-diff` must pass clean after the source change and after the tests.
