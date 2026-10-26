# Shell Markdown selection and copy

**Complexity: 3/10** — the rendered reply is already an HTML overlay on the terminal, so this needs local selection styling and key handling plus focused regression coverage. No protocol or architecture changes.

## Goal

Let users select text in rendered Markdown replies in shell tabs and copy that selection through the shared clipboard.

## Approach

Enable browser text selection on shell reply decorations. When a copy chord is pressed while a browser selection intersects a shell reply, copy the selected text through the tab capability and prevent xterm from treating the chord as terminal input. Keep ordinary terminal selection, terminal copy, and shell interrupt behavior unchanged.

## Implementation steps

1. Enable text selection on `.shell-output-block` and verify the style in the shell stylesheet test.
2. Handle copy chords for selected rendered reply text at the shell body boundary, leaving the existing terminal-selection and command-line behavior intact.
3. Add regression tests for selecting/copying a rendered reply and for preserving terminal behavior when the browser selection is outside a reply.
4. Update `product/specs/shell-tab.md` to describe selectable rendered replies and their copy behavior.

## Tests

- In `web/src/plugins/shell/shell-style.test.ts`, assert shell reply decorations allow text selection.
- In `web/src/plugins/shell/ShellTab.test.tsx`, verify a copy chord copies selected Markdown reply text and does not copy a selection outside a shell reply.

## Out of scope

- Changing terminal text selection or copy behavior.
- Adding new documentation where shell reply behavior is not already documented.
