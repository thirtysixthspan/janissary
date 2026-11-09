# Describe the home-restrictions notice in the pull request description
**Complexity: 1/10** — prose change to the live pull request description only; no source, spec, or test changes.

## Goal

The pull request description never mentions that the Commands tab shows a note when a valid project `.janissary/commands.json` lifts restrictions the home file sets. Describe it in What and give it a verification step.

## Approach

Verified against `web/src/plugins/commands/CommandsTab.tsx` and `product/specs/commands-tab.md`: the note appears above the table, beneath the source line, only while the Commands tab is open with a project file in effect, and names the commands the home file disables or denies agent access that the project file leaves enabled.

## Implementation steps

1. In What, after the sentence about a project file replacing the home file, add a sentence saying the Commands tab lists the commands whose home restriction a valid project file lifts.
2. Extend edge case 9 of How to verify with a scratch home file disabling `browser content` and a project file that does not, expecting the notice line naming `browser content`.
3. Apply with `gh pr edit --body-file` after the push, leaving all other text unchanged.

## Tests

None. Only the live description changes, and the notice is already covered by the existing Commands tab and payload tests.

## Out of scope

Source, specs, and documentation; the title; change-set statistics.
