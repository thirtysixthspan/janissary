# Judge glob matches by their real location when --path is an in-root symbolic link

**Complexity: 2/10** — ~14 added lines in 2 files, 3 requirements, 3 test scenarios (p=4.14)

The workspace glob entry accepts an in-root symbolic link to a directory as `--path` and walks it under the link's name. The start check classifies only the start itself, and the walker's per-match secret check runs on the link-named root-relative path. A link `cfg -> .config` therefore lists `cfg/gh/hosts.yml` and `cfg/gcloud/x`, and under `--hidden` a link `c -> .claude` lists `c/.credentials.json`, because the link name breaks the `.config/gh/hosts.yml`, `.config/gcloud`, or `.claude/.credentials.json` segment run. The canonical plan (`product/plans/complete/file-glob.md`) promises that any path `file read` would refuse as `Secret file:` is silently left out and does not count toward the limit.

## Goal

When the real location of `--path` differs from its lexical path, every match is also judged by its real root-relative location, and a match that location makes a secret file is left out before it counts toward the limit. Output keeps the link-named lexical paths. Regular files under a start that is not a link pay no extra work, and no match pays a per-file `realpath`.

## Approach

Verified against the code: `resolveStart` in `src/file-glob/glob.ts` already computes `realRoot` and `realTarget` through `resolveReal`, but returns only the lexical `start`. `record` in `src/file-glob/walk.ts` runs `checkLexicalPath(state.options.root, rootRelative)` on the lexical root-relative path. The walker never enters a symbolic link to a directory, so below the start every directory is real, and a match's real location is the start's real location joined with the match's start-relative path. That is a prefix substitution, needing no I/O per match.

`resolveStart` returns the start's real path relative to the real root (forward slashes) as `realStart` beside `start`. `globWorkspace` passes it to `walkGlob` through a new optional `GlobWalkOptions.realStart`. `walkGlob` keeps it on `WalkState` as `realPrefix` only when it differs from the lexical prefix, otherwise `undefined`. `record` gains a small `isSecretMatch` helper: the existing lexical check, then, when `realPrefix` is set, `checkRealTarget(state.realRoot, path.join(state.realRoot, realPrefix, startRelative))` from `src/file-read/policy.ts`; a `'Secret file'` result drops the match. `checkRealTarget` does string work plus the home-directory test, no target I/O. Symbolic links to files keep their existing `linkTargetAllowed` check.

## Implementation steps

1. In `src/file-glob/glob.ts`, extend the `start` variant of `StartResolution` with `realStart`, set from `path.relative(real.realRoot, real.realTarget)` with separators turned into `/`, and pass it as `realStart` to `walkGlob` (omitted when there is no `--path`).
2. In `src/file-glob/walk.ts`, add optional `realStart?: string` to `GlobWalkOptions` and `realPrefix: string | undefined` to `WalkState`; in `walkGlob`, set `realPrefix` to `options.realStart` when it is defined and differs from the lexical prefix.
3. Add `isSecretMatch(state, startRelative, rootRelative)` and call it from `record` in place of the inline lexical check.
4. Note the rule in the Secret files decision of `product/plans/complete/file-glob.md`.

## Tests

In `src/file-glob/glob.test.ts`, under `--path decisions`:

- An in-root link `cfg -> .config` holding `gh/hosts.yml`, `gcloud/x`, and `ok.txt` gives `cfg/ok.txt` alone for `** --path cfg`, with and without `--hidden`.
- An in-root link `c -> .claude` holding `.credentials.json` and `settings.json` gives `c/settings.json` alone for `** --path c --hidden --limit 1`, with no truncation line, so the omitted secret does not count toward the limit.

Existing tests that must pass unchanged: `lists through an in-root link under the link name`, `gives (no matches) for an in-root link to a secret directory`, and all of `src/file-glob/walk.test.ts` and `src/file-glob/walk-modes.test.ts`. Both new tests fail on the old code.

## Out of scope

- Changing output to real paths, or following symbolic links to directories inside the walk.
- Changing `src/file-read/policy.ts` or `SECRET_DENY_PATHS`.
- Specs and help: no spec or help page describes `file glob` yet.
