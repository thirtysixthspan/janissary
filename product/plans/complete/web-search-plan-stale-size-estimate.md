# Remove the web-search plan's stale size estimate

**Complexity: 1/10** — no production code changed, no production files edited, one requirement (p=2.07).

## Goal

`product/plans/complete/web-search.md` opens with a complexity line that still carries the pre-delivery estimate: `~920 added lines, 23 files edited, 44 requirements, 62 test scenarios (p=8.74)`. That line describes the ready plan before the feature was decomposed, not the delivered change. The branch now changes 112 files with 5,035 insertions and 280 deletions against `origin/master`, and the plan itself records that the work landed in fourteen slices with the subplans and repair plans folded in. A reader judging review effort from the old estimate under-scopes the change by roughly four times.

The fix removes the stale parenthetical and keeps the `Complexity: 8/10` rating. A replacement states only a stable fact that will not drift with the next push: the plan already says the feature landed in fourteen slices, with the completed subplans and repair plans folded in.

## Approach

Change one line: the bold complexity line directly under the `#` title. Keep the title, the goal paragraph, and every design decision byte-for-byte. Replace the numeric estimate with the stable slice statement, so a later reader gets context without a count that contradicts the diff.

No code, test, spec, help page, or user documentation changes. The fix is plan metadata only. The measured diff is a verification input for this plan, not a number to publish in the canonical plan, because it moves with every push to the branch.

## Design decisions

1. **Remove the estimate instead of correcting it.** The entry's proposal calls out that any replacement line, file, or test count goes stale again. The delivered diff already differs from the entry's figure (112 files and 5,035 insertions now, against 105 files and 4,587 insertions when the entry was written), which is exactly why a fresh count is the wrong replacement.

2. **Keep the complexity rating.** `Complexity: 8/10` is the plan's recorded rating and is not a delivery statistic. The task's fixed summary line keeps it in place.

3. **Substitute a stable fact.** The plan's Order of work already states the feature landed in fourteen independently green slices, and the header's old estimate came from the pre-decomposition plan. Saying the slices and folded subplans are what the delivered plan covers keeps the line informative without a number that drifts.

4. **One file, one line.** The report can quote the current `git diff --shortstat origin/master...HEAD`; the canonical plan does not.

## Implementation steps

1. Read the first three lines of `product/plans/complete/web-search.md` and confirm the stale parenthetical is there.
2. Replace the complexity line with `**Complexity: 8/10** — fourteen feature slices, with the completed subplans and repair plans folded in`.
3. Run `$janissary/scripts/run.mjs check-diff`.
4. Confirm the first three lines and confirm the goal paragraph and design decisions are unchanged with `git diff`.

## Tests

No automated tests. The change is prose in one plan file, so there is no test surface. Run `$janissary/scripts/run.mjs check-diff` after the edit; markdown changes are lint-only and the command must exit 0.

Manual verification: read the first three lines of the plan and confirm the complexity line carries `8/10` with no line, file, requirements, or scenario count. Run `git diff --stat origin/master...HEAD` for the report figure only.

## Out of scope

- Changing any other line of `product/plans/complete/web-search.md`, including the goal paragraph and the design decisions.
- Changing code, tests, specs, `help/`, or user documentation.
- Restating a current line, file, or test count in the canonical plan.
- Resolving anything else on the branch.
