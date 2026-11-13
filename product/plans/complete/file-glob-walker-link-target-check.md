# Drop glob matches that are symbolic links to secret or out-of-workspace files

**Complexity: 2/10** — ~15 added lines in 1 file, 3 requirements, 3 test scenarios (p=3.98)

The walker classifies a symbolic link to a file as a file and runs the secret check only on the link's own root-relative path. A link such as `notes.txt` pointing at `.env`, at a file under `~/.aws/`, or at a file outside the workspace root passes the filter and is listed, while `file read` on the same path refuses it through `checkRealTarget`. The canonical plan (`product/plans/complete/file-glob.md`) promises that a path `file read` would refuse as `Secret file:` is silently left out of the results and does not count toward the limit; a link currently bypasses that.

## Goal

A symbolic-link match whose resolved target `file read` would refuse (a secret file, or a file outside the workspace) is left out of the results before it counts toward the limit, and a link whose target cannot be resolved is left out too. Links to ordinary in-workspace files are still listed, and regular files and directories pay no extra I/O.

## Approach

Verified against the code: `classify` in `src/file-glob/walk.ts` returns `'file'` for a link whose `stat` target is a file, and `record` only runs `checkLexicalPath(state.options.root, rootRelative)`, which judges the link's own name. `checkRealTarget(realRoot, realTarget)` in `src/file-read/policy.ts` is the check `file read` applies to the resolved target and expects both arguments to be canonical paths.

`classify` reports a link to a file as a new `'link'` kind. `walkGlob` resolves `options.root` once with `realpath` from `node:fs/promises` and keeps it on `WalkState` as `realRoot` (the root itself may sit under a symbolic link, such as macOS's `/var` temporary directories). `record` takes the entry kind and the entry's absolute path; after the matcher and the existing lexical secret check, for `'link'` entries only it calls a small helper that resolves the link with `realpath` and runs `checkRealTarget(state.realRoot, target)`. Any failure result, or a rejected `realpath`, drops the match before the push, so it never counts toward the limit. Regular files and directories never reach the helper, keeping the "check only matches" cost rule.

## Implementation steps

1. In `src/file-glob/walk.ts`, import `realpath` from `node:fs/promises` and `checkRealTarget` from `../file-read/policy.js`; add `'link'` to `EntryKind`; add `realRoot` to `WalkState`; have `classify` return `'link'` for a link whose target is a file.
2. Add `linkTargetAllowed(state, absPath)` that returns whether `realpath(absPath)` resolves and `checkRealTarget(state.realRoot, target)` reports no failure, returning false on rejection.
3. Make `record` async, taking the entry kind (`'file' | 'link' | 'directory'`) and absolute path in place of the `isDirectory` flag; call `linkTargetAllowed` for `'link'` after the lexical check. `visitEntry` awaits `record` for files and links in file mode and for directories under `--dirs`.
4. In `walkGlob`, compute `realRoot` with `await realpath(options.root)` when building the state.
5. Note the rule in the design decisions of `product/plans/complete/file-glob.md` and `product/plans/complete/file-glob-3-sorted-walker-2-dirs-links-secrets-deadline.md`.

## Tests

In `src/file-glob/walk-modes.test.ts`:

- A link `notes.txt -> .env` plus an ordinary file `a`, walked with `limit: 1`, returns `{ paths: ['a'], truncated: false, timedOut: false }`: the link is omitted and not counted.
- A link `out.ts` to a file in a second `mkdtempSync` directory outside the root is omitted in file mode, while an ordinary file beside it is listed.
- The existing "lists a symbolic link to a file in file mode only" case (a link to an in-root file) still lists `link.ts`; it now also exercises the realpath of a root under a symbolic-linked temporary directory.

`walk.test.ts` and the rest of `walk-modes.test.ts` pass unchanged.

## Out of scope

- Changing `src/file-read/policy.ts` or exporting `isSecretPath`.
- Following symbolic links into directories (still never entered).
- The second backlog entry (pinning `--dirs` matching against the slash-free path).
- The `product/specs/acp.md` `### File glob` section, which subplan work for the command's wiring writes from the canonical plan's design decisions; no user-facing spec or help page describes `file glob` yet.
