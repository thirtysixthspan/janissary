# Show tab and group target syntax in monitor help

**Complexity: 2/10** — a documentation-only correction to two existing help pages. The monitor syntax and behavior are already implemented and covered by the spec and tests.

## Goal

Make the target forms accepted by `monitor` and `unmonitor` discoverable in their help pages: tab labels, display aliases, and `group:<n>` targets. Keep the existing `monitor ask` and `unmonitor --all` forms visible.

## Evidence

The canonical help-page design in `product/plans/complete/help-command.md` uses Usage and Examples blocks for each command. `product/specs/monitoring.md` says explicit monitor targets are tab labels or `group:<n>`, and that display aliases work case-insensitively for both monitor start and target removal. `src/monitor/parsing.ts` parses tab words and numeric `group:<n>` forms, plus `monitor ask` and `unmonitor --all`. `src/monitor/parsing.test.ts`, `src/monitor/targets.test.ts`, and `src/monitor/manager.test.ts` cover these forms and alias resolution.

## Approach

Clarify the Usage and Examples blocks in `help/monitor.md` and `help/unmonitor.md`. Keep the prose aligned with the existing grammar: monitor start accepts one or more tab or group targets, while unmonitor removes one target at a time. State that tab labels and display aliases are both accepted and that alias matching ignores case.

## Implementation steps

1. Update `help/monitor.md` usage and examples with the tab/group target syntax and a concise note about labels and display aliases. Preserve the inline monitor and `monitor ask` examples.
2. Update `help/unmonitor.md` usage and examples with one tab/group target per invocation, including label, alias, and group examples. Preserve `unmonitor --all`.
3. Remove this resolved item from `product/backlog/pull-request.md`, preserving all later entries.

## Tests

No new automated tests. This change documents existing behavior; the parser, target, and manager tests already cover the supported forms, and a wording-only test would not verify runtime behavior. Run `$janissary/scripts/run.mjs check-diff` after each change.

## Spec

No spec edit is needed. `product/specs/monitoring.md` already accurately describes tab labels, display aliases, case-insensitive matching, and `group:<n>` targets; it is the source used to verify the help wording.

## Out of scope

- Changing monitor parsing, target resolution, or monitor behavior.
- Adding tests that assert help-page wording.
- Changing unrelated help pages or other backlog entries.
- Updating the pull request description.

## Verification

- Run `$janissary/scripts/run.mjs check-diff` after each change and after promoting the plan and removing the backlog item.
- Review the final help pages against `product/specs/monitoring.md`, `src/monitor/parsing.ts`, `src/monitor/parsing.test.ts`, `src/monitor/targets.test.ts`, and the alias-resolution cases in `src/monitor/manager.test.ts`.
- Confirm only the selected backlog entry was removed and PR #1799 remains open on its existing head branch.
