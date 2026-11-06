# Separate closed connections visually

Complexity: 1/10

## Goal

Add one blank row of spacing between open and closed connection groups.

## Approach and implementation steps

1. Add a status-boundary CSS rule to the existing ordered list. Keep DOM rows and keyboard indices unchanged. Apply to both wide and docked lists.
2. Test computed spacing for every closed status in both layouts, no spacing within closed groups, and no leading spacing for an entirely closed list. Run check-diff after each step.
3. Update the connections-tab spec and existing documentation if it describes grouping, promote this plan, remove the issue, and ship through the merge workflow.

## Tests

Use the existing render fixtures and the actual feature stylesheet to verify spacing at the group boundary and its absence elsewhere.

## Out of scope

Changing server ordering, adding selectable separator rows, or changing connection controls.
