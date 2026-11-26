# Anchor the Hosts import/export description on component tests

**Complexity: 1/10** — no production code added or edited, no test scenarios, no new units (p=1.578); the fix is one description paragraph plus plan and backlog bookkeeping.

## Goal

The pull request's `### Screenshots` paragraph says no screenshot could be captured and attributes that to the plan-first workflow, without naming a code path, a line, or a test assertion. A reader cannot check that claim, so the section says nothing verifiable about the two new buttons. Replace that paragraph with an anchor to the component cases that pin the buttons' labels, icons, placement and empty-state visibility, and leave the author's every other description paragraph exactly as written.

## Requirements

1. "The description's Screenshots section states that no screenshot could be captured ... without naming any code path, line, or test assertion." The replaced paragraph must name its evidence instead of leaving the claim unanchored.
2. "Replace that paragraph with an anchor to the component cases" — the body text under the `### Screenshots` heading is replaced in place, not appended to.
3. "that prove the two buttons' labels, icons, placement and empty-state visibility in web/src/plugins/hosts/HostList.test.tsx" — the replacement cites the case at `web/src/plugins/hosts/HostList.test.tsx:122` for the labels and icons.
4. "that prove the two buttons' labels, icons, placement and empty-state visibility in web/src/plugins/hosts/HostList.test.tsx" — the replacement cites the case at `web/src/plugins/hosts/HostList.test.tsx:132` for the placement and empty-state visibility.
5. "Keep the Behavior examples and How to verify sections unchanged, since their lines already name their code paths and test assertions." Both sections stay byte-for-byte as the author wrote them.
6. "preserve every other paragraph byte-for-byte" — no paragraph outside `### Screenshots` is rewritten, reordered, or reformatted.
7. "No source file needs to change." — no application code, test, spec, help page, or user/developer documentation file is edited.
8. "apply the description edit only after the push" — the GitHub body edit runs only after a successful `git push`, never before it.

## Design decisions

- The `### Screenshots` heading stays; only its body paragraph is replaced. Removing the heading entirely would be a larger edit than the work item asks for.
- The unverifiable claim about screenshot capture is dropped with the old paragraph. Keeping even a shortened version of it would leave the finding unresolved.
- The anchor names both existing cases by their full `it(...)` titles and their line numbers, so a reader can go straight to the assertions: `names both buttons and shows their import and export icons` at line 122, and `keeps both buttons in the metadata header when the list is empty` at line 132.
- Those cases already exist and pass, so no test is added. The description points at proof that is already in the tree rather than creating new proof.
- `gh pr edit` replaces the whole body, so preservation of the other paragraphs is done by writing the complete body to `./temp/pr-body.md` with only the one paragraph changed. `temp/` is gitignored, so the scratch file never reaches a commit.
- The body edit lands after the push. If checkout, checks, commit, or push fails, the pull request still carries the author's original description rather than describing work absent from its branch.
- The pull request title is not touched. Changing it would be a different work item.
- The resolved backlog entry is removed and the plan is promoted to `complete/`, so a description-only fix still produces a commit for `pr-check-changes` to ship.

## Preserved behavior

1. The Import and Export buttons keep their accessible labels and their import/export icons; they must not be renamed, relabeled, or lose their `data-icon` values. The existing test `names both buttons and shows their import and export icons` in `web/src/plugins/hosts/HostList.test.tsx:122` must keep passing and pins this behavior.
2. Both buttons stay inside the metadata header and stay visible when the host list is empty; they must not move out of the header or disappear in the empty state. The existing test `keeps both buttons in the metadata header when the list is empty` in `web/src/plugins/hosts/HostList.test.tsx:132` must keep passing and pins this behavior.

## Assumptions

1. `web/src/plugins/hosts/HostList.test.tsx:122` holds `it('names both buttons and shows their import and export icons', ...)`, which asserts both accessible names, both title attributes, and the `file-import` and `file-export` icons.
2. `web/src/plugins/hosts/HostList.test.tsx:132` holds `it('keeps both buttons in the metadata header when the list is empty', ...)`, which asserts the ordered button labels in `.plugin-actions` with no rows rendered.
3. `product/backlog/pull-request.md:5` holds `* Correct the description's Screenshots claim, which names no code path or test that supports it.`, the recorded work item this run resolves.
4. `product/backlog/pull-request.md:13` holds the `Proposal:` that names this exact invocation and the two component cases, so the invocation selector matches a recorded entry rather than a new work item.
5. The pull request body fetched with `gh pr view <reference> --json body` has a single `### Screenshots` paragraph between that heading and `### How to verify`, and no other paragraph mentions screenshot capture.

## Existing functionality

1. `web/src/plugins/hosts/HostList.test.tsx:122` provides the label-and-icon evidence the replacement cites, with the quoted identifier `names both buttons and shows their import and export icons`.
2. `web/src/plugins/hosts/HostList.test.tsx:132` provides the placement-and-empty-state evidence the replacement cites, with the quoted identifier `keeps both buttons in the metadata header when the list is empty`.
3. `ai/tasks/feature/work-pull-request-issue.md:148` provides the multi-line body edit route, the quoted command `gh pr edit <reference> --body-file ./temp/pr-body.md`, which avoids shell quoting problems with markdown.
4. `product/backlog/pull-request.md:1-3` provides the comment-and-heading skeleton that the file is restored to once its only entry is removed, matching `git show origin/master:product/backlog/pull-request.md`.

## Implementation steps

1. Read the current pull request body with `gh pr view <reference> --json body` and mark the exact bounds of the `### Screenshots` paragraph. Confirm the two anchor cases at `web/src/plugins/hosts/HostList.test.tsx:122` and `:132` are still present and describe the four traits they are cited for. Build command: `$janissary/scripts/run.mjs check-diff`.
2. Replace only the body paragraph under `### Screenshots` with an anchor naming both cases and their line numbers, keeping the heading and the blank lines around it. Write the complete revised body to `./temp/pr-body.md` but do not call `gh pr edit` yet. Build command: `$janissary/scripts/run.mjs check-diff`.
3. Remove the resolved entry whole from `./product/backlog/pull-request.md` and restore the file to the master comment-and-heading skeleton, since it is the only entry. Move the finished plan from `./product/plans/ready/` to `./product/plans/complete/` with plain `mv`. Build command: `$janissary/scripts/run.mjs check-diff`.
4. Confirm with `git status` that the only tracked changes are the completed plan file and the emptied pull-request backlog, and that no source, test, spec, help, or documentation file was touched. Build command: `$janissary/scripts/run.mjs check-diff`.
5. Commit the file changes with a Conventional Commit subject describing the description correction, push to the same head branch, and only then apply the staged body with `gh pr edit <reference> --body-file ./temp/pr-body.md`. Confirm the pull request is still `OPEN` and its `headRefOid` matches `git rev-parse HEAD`. Build command: `$janissary/scripts/run.mjs check-diff` after each file change; the body edit itself changes GitHub state, not the tree.

## User interface

1. None. This change edits pull-request prose and two product-planning files; it adds or changes no surface a user sees or operates inside the app, and no application behavior is modified.

## Tests

This plan changes no application behavior and introduces no code, so no new tests are written. The two cases the description points to already cover the required evidence: `names both buttons and shows their import and export icons` (`web/src/plugins/hosts/HostList.test.tsx:122`) covers requirement 3, and `keeps both buttons in the metadata header when the list is empty` (`web/src/plugins/hosts/HostList.test.tsx:132`) covers requirement 4. Requirements 1, 2, and 5 through 8 are prose-editing requirements with no test surface; `$janissary/scripts/run.mjs check-diff` is the check for them.

## Out of scope

- The `### Behavior examples` and `### How to verify` sections, which stay byte-for-byte unchanged (requirement 5).
- The pull request title and every description paragraph other than `### Screenshots`.
- Adding, capturing, or generating a screenshot.
- Source code, tests, CSS, functional specs, help pages, and both `documentation/user-documentation/` and `documentation/developer-documentation/`.
- `product/backlog/issues.md` and any new backlog entry for the named work item, which was already recorded on this branch.
- Merging, closing, or replacing the pull request, and rewriting any published commit.

## Verification

`$janissary/scripts/run.mjs check-diff` — expected green after every file change; with no source under `src/` or `web/src/` changed, it checks only the touched files and reports no lint, typecheck, or test regression.

Manual, reading-based: run `gh pr view <reference> --json body` and confirm the `### Screenshots` paragraph is now an anchor naming `names both buttons and shows their import and export icons` at `web/src/plugins/hosts/HostList.test.tsx:122` and `keeps both buttons in the metadata header when the list is empty` at `:132`, and that it no longer claims a screenshot could not be captured. Read the `### Behavior examples` block and the `### How to verify` section and confirm they, the title, and every other paragraph are byte-for-byte what the author wrote. A failure is any other paragraph rewritten, a missing case name or line number, or a body edit applied before the push.
