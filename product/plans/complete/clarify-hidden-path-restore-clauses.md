# Clarify hidden-path behavior in file-navigator restore clauses

**Complexity: 2/10** — a focused restore-command regression test and precise spec and PR-description wording. The restore behavior itself does not change.

## Goal

Correct PR #1803's description and the file-navigator spec so they distinguish directory expansion from row selection when a path is hidden behind a collapsed parent.

## Approach

`applyStep` handles `expand` by checking whether the path still names a directory, then records it with `expandAndWatch`. Row clauses check the currently visible paths. Test this distinction without changing the implementation.

## Implementation steps

1. Add a focused case to `src/file-navigator/restore-command.test.ts` that expands an existing nested directory while its parent is collapsed, then expands the parent and verifies the nested row is visible and expanded. Keep the existing ordered-clause and selection-fallback tests intact.
2. Clarify `product/specs/file-navigator-tab.md`: `expand` can record an existing nested directory before its collapsed ancestors are opened, while `cursor`, `anchor`, and `select` ignore rows that are not visible when those clauses run.
3. After pushing the branch changes, correct only the PR-description paragraph that claims hidden paths are ignored by every view clause. Preserve every other paragraph exactly and leave the title unchanged.
4. Promote this plan to `complete/` and remove only this resolved first entry from `product/backlog/pull-request.md`.

## Tests

The new restore-command case verifies that `src/deep` remains in the expanded set when expanded before `src`, and that the row appears as expanded after `src` is opened. Existing ordered-clause and selection-fallback cases remain unchanged. Run `$janissary/scripts/run.mjs check-diff` after the test and spec edits.

## Spec and docs

Update `product/specs/file-navigator-tab.md` as described above. No help or user-documentation page claims that hidden row paths are ignored for every clause, so no public documentation change is needed.

## Out of scope

- Changing restore-command behavior or changing how `collapse` works.
- Editing any other pull-request backlog entry.
- Changing any other paragraph or the title of PR #1803.
- Changing help pages or user documentation.
