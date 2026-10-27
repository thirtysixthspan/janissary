# Remove live verification directives from completed plans

**Complexity: 2/10** — replace two active verification instructions with historical records, audit the plans for any other review-time command directives, and remove one backlog entry. No application behavior changes.

## Goal

Keep completed implementation and test history visible without asking reviewers to execute tooling from a pull-request checkout.

## Approach

Replace each imperative diff-check instruction with a concise past-tense record of the checks that were completed. Preserve all feature implementation and test descriptions. Review both plans for other live review-time command directives, then remove only this resolved backlog entry while keeping the backlog's leading comment and heading.

## Implementation steps

1. Replace the active diff-check instruction in `product/plans/complete/quote-aware-files-path-completion.md` with its completed verification record.
2. Replace the active diff-check instruction in `product/plans/complete/quote-profile-file-navigator-labels.md` with its completed verification record, and review both plans for any other active review-time command directives.
3. Promote this plan to complete and remove the resolved entry from `product/backlog/pull-request.md`.

## Tests

No application tests were needed because this change affected only completed plans and the pull-request backlog. Diff-scoped checks passed after each target-plan edit. A manual review confirmed that no active review-time command directives remained in the two target plans.

## Spec

No spec change is needed because application behavior and the testing workflow do not change.

## Docs

No public documentation change is needed. The two completed plans are the affected developer documentation.

## Out of scope

- Changes to application code, application tests, or the feature and test history in either plan.
- Changes to specs, help, user documentation, or the pull-request description.
- Any other pull-request backlog entry.
