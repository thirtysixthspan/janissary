<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Consult the git-ignored set by the real location under a linked `--path`, so git-ignored paths are still skipped by default when the search starts at an in-root symbolic link, closing a functionality gap.

Existing Issue: Under an in-root linked `--path` such as `lnk` pointing at `src`, the walker looks up each entry in the ignored set by its link-named root-relative path (`lnk/dist`), while git reports the ignored entry by its real path (`src/dist`), so git-ignored folders and files below a linked start are listed without `--hidden`. Severity: 3/10

Existing Risk: 2/10 - A linked `--path` is uncommon, but when used it floods the result with build output or other ignored files, wasting the limit and the agent's context while contradicting the documented default that git-ignored paths are skipped.

Proposal Risk: 1/10 - The lookup gains one extra set-membership test per entry under a linked start, and the remaining edge (an ignore rule that only matches the link name) would surface as a listed path, never as a hidden one.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2001 "skip git-ignored paths by real location under a linked file glob --path". In `src/file-glob/walk.ts`, when `state.realPrefix` is defined, make `isPruned` (or its caller in `walkDirectory`) also treat an entry as ignored when `realPrefix` joined with its start-relative path is in `options.ignored`, keeping the link-named lookup for the non-linked case and leaving the `--hidden` bypass unchanged. Add a test in `src/file-glob/glob.test.ts` inside the `git-ignored paths` block that creates an in-root link to `src` and asserts `**/*.ts --path <link>` omits the ignored `src/gen/x.ts` without `--hidden` and lists it with `--hidden`, plus a walk-level case in `src/file-glob/walk.test.ts` passing `realStart`. The existing ignored-set walk tests in `src/file-glob/walk.test.ts` and the `lists through an in-root link under the link name` test in `src/file-glob/glob.test.ts` must keep passing untouched.
