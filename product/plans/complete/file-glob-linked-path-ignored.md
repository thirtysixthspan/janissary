# Skip git-ignored paths by their real location under a linked file glob `--path`

**Complexity: 2/10** — ~8 added lines, 1 file, 3 requirements, 4 test scenarios (p=3.94)

Under an in-root linked `--path` such as `lnk` pointing at `src`, `walkGlob` in `src/file-glob/walk.ts` looks each entry up in the ignored set by its link-named root-relative path (`lnk/gen`), while `git ls-files --others --ignored --directory` reports the entry by its real path (`src/gen`). Git-ignored folders and files below a linked start are therefore listed without `--hidden`, contradicting the documented default that git-ignored paths are skipped.

## Goal

When `--path` is an in-root symbolic link, an entry below it is skipped without `--hidden` when its real location (the link target's root-relative path joined with the entry's start-relative path) is in the git-ignored set. The link-named lookup stays, the non-linked case is unchanged, and `--hidden` still bypasses the ignored set entirely. Listed paths keep the link name.

## Approach

The walk already carries `realPrefix`, the link target's root-relative path, defined only when it differs from the lexical start prefix; `isSecretMatch` uses it to check secrets by real location. Apply the same idea to pruning: `walkDirectory` computes each entry's start-relative path alongside its root-relative path, and the prune check also tests `realPrefix` joined with the start-relative path against `options.ignored` when `realPrefix` is defined. `realPrefix` may be empty (a link to the root itself), in which case the joined path is the start-relative path, which is exactly git's path for it.

`walk.ts` is about 130 lint-counted lines, so the one extra helper fits without extracting a module.

## Implementation steps

1. `src/file-glob/walk.ts`: add an `isIgnored(state, rootRelative, startRelative)` helper that tests `options.ignored` for the root-relative path and, when `state.realPrefix` is defined, for the real path; have `isPruned` take the state and the start-relative path and use it; compute the start-relative path in `walkDirectory` and pass it on to `visitEntry` rather than recomputing it there.

## Tests

- `src/file-glob/walk.test.ts`: a walk started at an in-root link `lnk` to `src` with `realStart: 'src'` and ignored set `{'src/gen'}` lists `lnk/keep.ts` only; with `hidden: true` it also lists `lnk/gen/out.ts`.
- `src/file-glob/glob.test.ts`, `git-ignored paths` block: with an in-root link to `src`, `**/*.ts --path <link>` omits the git-ignored `src/gen/x.ts` and lists `<link>/a.ts`; with `--hidden` it lists `<link>/gen/x.ts` too.
- The existing ignored-set walk tests in `src/file-glob/walk.test.ts` and `lists through an in-root link under the link name` in `src/file-glob/glob.test.ts` keep passing untouched.

## Spec

`product/specs/acp.md` (file glob skip rules): state that under a `--path` that is a symbolic link to a folder in the workspace, git-ignored paths are skipped by their real location.

## Out of scope

- Ignore rules that match only the link name (the remaining edge surfaces as a listed path, never a hidden one).
- Entering folder symbolic links during the walk, or any change to secret handling.
