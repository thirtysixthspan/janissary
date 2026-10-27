# Complete tab targets from displayed names

**Complexity: 3/10** — the completion path already handles quoted tab names; it needs the same ordered label-and-alias candidates as tab lookup, plus focused regression coverage and behavior documentation.

## Goal

Complete `tab` command targets using the names users see in the strip as well as the internal labels. For an editor displaying `space name.txt`, `tab move "space` should complete to `tab move "space name.txt" `.

## Approach

Expose the target names accepted by tab lookup from `TabManager`: each tab's label followed by its display title, in tab order, with case-insensitive duplicates removed while keeping the first spelling. This preserves the existing first-matching-tab rule. Pass these names through the existing completion chain, which already quotes names containing whitespace. Other tab-target completion contexts use the same candidate list and will also accept display titles.

## Implementation steps

1. Add an ordered, first-spelling-preserving label-and-title name list in `src/tab/lookup.ts` and expose it from `src/tab/manager.ts`.
2. Supply that list to command completion from `src/controller/completion.ts`.
3. Add a lookup test for ordering and case-insensitive duplicate names, and an integration regression in `src/controller.test.ts` that opens a spaced-name editor and completes its displayed title from a shell tab.

## Tests

- Verify label and title candidates follow tab order and duplicate names retain the first candidate, matching command lookup's first-match rule.
- Verify controller completion completes `tab move "space` to `tab move "space name.txt" ` for an open editor displaying `space name.txt`.
- Verify the shell-plugin `completeLine` fixture in `src/plugins/shell-capabilities.test.ts` provides the tab label-and-alias accessor used by controller completion.
- Run `$janissary/scripts/run.mjs check-diff` after each implementation and test change.

## Specs and documentation

- Update `product/specs/tab-completion.md` to describe tab subcommand, target, and side completion, including labels, display titles, and duplicate-name resolution.
- Update `help/keys.md`, `documentation/user-documentation/command-bar/tab-completion.md`, and `documentation/user-documentation/getting-started/tabs.md` where they describe target completion or claim aliases are not offered.

## Out of scope

- Changing tab target resolution, its case-insensitive matching, or its first-match ordering.
- Changing completion behavior outside tab-name target candidates.
