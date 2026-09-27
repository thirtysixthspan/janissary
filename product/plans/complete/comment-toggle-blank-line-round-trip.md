# Cmd+/ twice leaves padding behind on a blank line in an indented range

**Complexity: 2/10**: the line-comment strategy's uncomment edit also takes the leading whitespace on a line that holds nothing but the marker. One pure function changes, and the comment step is untouched.

## Bug

Cmd+/ twice does not return a commented block to its original text when the range contains a blank line. The spec says "Pressing Cmd+/ twice therefore always returns the text to exactly what it was." Selecting `  const a = 1;` / (blank) / `  const b = 2;` in a `.ts` file and pressing Cmd+/ twice brings both code lines back exactly, but the blank line comes back as two spaces, and the buffer is left dirty with an edit the user never made.

## Root cause

`commentEdit` in `web/src/editor/plugins/commenting/line-comment.ts` pads any line shorter than the common indent out to the marker column, inserting `padding + marker + ' '`. A blank line in a range indented two spaces becomes `  // `. `uncommentEdit` in the same file removes only the marker and one following space, so the two spaces of padding the comment step added stay behind as `  `.

## Correct behavior

The first press is unchanged: every line, blank ones included, gains the marker at the least-indented line's first non-whitespace column, so the block reads as contiguous. The second press returns a line that the first press turned into padding plus the marker back to an empty line, so a range with blank lines round-trips exactly and the buffer is clean again.

## Reproduction

`web/src/editor/plugins/commenting/toggle.test.ts`, written before the fix: toggle `'  const a = 1;\n\n  const b = 2;'` over lines 0–2, then toggle the result over the same lines. The first press gives `'  // const a = 1;\n  // \n  // const b = 2;'` as expected. The second press gives `'  const a = 1;\n  \n  const b = 2;'` on `master`: the middle line is two spaces, not empty.

## Approach

In `uncommentEdit`, when the line holds nothing but leading whitespace, the marker, and at most one following space, the edit starts at column 0 and removes the whole line. The comment step pads exactly such lines, and a line of that shape carries no content that would be lost, so clearing it is safe for hand-written empty comments too.

The comment step already maps an empty line and a whitespace-only line no longer than the common indent to the same `padding + marker + ' '`, so the uncomment step cannot tell them apart. Both come back empty. An empty line is by far the common case, and the only thing lost for a whitespace-only line is trailing whitespace. A whitespace-only line longer than the common indent keeps its extra spaces after the marker and still round-trips exactly.

A bare caret inside the leading whitespace of such a line lands at column 0, because the caret shift is clamped there already.

## Implementation steps

1. `web/src/editor/plugins/commenting/line-comment.ts`: in `uncommentEdit`, when everything after the marker and its optional space is empty, start the edit at column 0 instead of at the marker.
2. Tests: add the regression test below.
3. Spec: in `product/specs/editor-tab.md`'s Commenting section, say that uncommenting a line that holds only the marker leaves it empty, so a blank line in an indented range comes back blank, and that a line of only spaces comes back empty too.

## Regression test

`web/src/editor/plugins/commenting/toggle.test.ts`, `round-trips an indented range with a blank line exactly through two presses`: toggles `'  const a = 1;\n\n  const b = 2;'` twice and asserts the first press's output and that the second press restores the original text exactly.

## Out of scope

- Where the comment step places markers, including padding blank lines. The report calls the first press's output right.
- Block-comment languages, which wrap the range and do not pad.
- The other editor bug in the backlog: Shift+Tab.
