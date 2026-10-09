# Fix: make removed diff lines inert

**Complexity: 2/10** — line navigation and its pointer affordance both need to exclude removed lines in the unified and split layouts.

## Goal

Removed diff lines cannot open a file position that no longer exists. Added and context lines keep their current navigation behavior.

## Approach

Guard line navigation at the rendered row, and show the non-interactive cursor and hover treatment for removed rows. Keep the hunk's existing selection behavior so keyboard navigation remains available. Update the behavior spec to state which lines open the file.

## Implementation steps

1. Make removed unified and split rows inert for line navigation and style them without a pointer or hover affordance.
2. Add regression coverage for removed, added, and context line navigation and the row styles.
3. Update `product/specs/diff-tab.md` to describe the remaining navigation behavior.

## Tests

- Double-clicking a removed line in unified and split layouts opens no file.
- Double-clicking an added line or context line still opens its current position.
- Removed rows have no pointer cursor or hover highlight; added and context rows retain both.

## Out of scope

- Hunk selection and keyboard walking.
- Deleted-file behavior and whole-file expansion.
