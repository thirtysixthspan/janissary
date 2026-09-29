# Repair the mangled glyph in the pull request description's grid sketch

**Complexity: 1/10** — three lines of one paragraph of the pull request description. No code, no
test, no spec.

## Goal

The ASCII grid in the "Behavior examples" section of this pull request's description puts a
replacement character where one data row's delete control belongs, and pads the three rows'
last column to three different widths — so the table it sketches does not close on its own right
edge, and the broken glyph reads as a rendering fault in the feature rather than in the text.

The sketch is the part of the description a reader uses to picture the layout, so it has to look like
what it claims to show.

## Approach

Replace the three data rows with the same row drawn identically: one delete glyph per row, one
column width, and the right-hand box edge in the same column as every other line.

Nothing else in the description changes. Its prose, its verification steps, and its files-changed
list were checked against the diff while the finding was recorded and all three still match.

## Implementation steps

1. Read the current body with `gh pr view`, so the correction is applied to what is actually on
   GitHub rather than to what this plan was written against.
2. Rewrite the three data rows of the grid sketch in the "Behavior examples" section, keeping every
   other paragraph byte-for-byte as the author wrote it.
3. Apply with `gh pr edit --body-file`, and leave the title alone.

## Tests

None — this is a document. The check is reading the rendered description and confirming the grid
closes on its right edge and that no row carries a replacement character.

## Out of scope

- The title, which matches the commit subject and is never edited.
- Any other paragraph of the description, including the ones the resolved findings did not name.
- The feature itself, which is correct as merged.
