# Paste into an editor buffer from a popup opened by its chord

**Complexity: 2/10** — the root cause was fixed by the change that gives the popup the keyboard. What remains is pinning the whole route with an end-to-end test and saying so in the spec.

## Goal

The pull request backlog reports that pasting into an editor tab fails when the clipboard popup was opened with `Ctrl+Shift+V`.

## Root cause

Before the popup took focus, the editor buffer kept the keyboard while the popup was up, which broke both ways of choosing an entry:

- **Return** reached the editor's hidden textarea first. The editor binds Enter to inserting a newline and stops the event there, so the popup never saw it.
- **A click** on a row blurred the editor's textarea before the click landed. The paste capability then read `document.activeElement`, found the body, failed to find an editor under it, and fell through to the command bar route. An editor tab has no command bar of its own to receive the text.

The previous entry fixed both. The popup now takes focus, so Return reaches the popup. The seam also records the editor's textarea as the overlay's focus origin, and the paste capability pastes there rather than at the live focus. The editor's drop handle then focuses its buffer and pastes at the caret.

## Approach

No production change is needed. This entry adds a test that drives the real route end to end: the clipboard plugin's module started with the real paste capability, registered on the real seam, with an editor buffer that held the keyboard when the overlay opened. That test fails on the code before the previous entry and passes now.

## Implementation steps

1. `web/src/overlay-plugins/clipboard-history/paste-routing.test.tsx` (new) — the end-to-end tests below.

## Tests

- With an editor's textarea focused, opening the overlay and rendering the popup moves focus to the popup; Return pastes the newest entry into the editor through its drop handle's `pasteAtCaret`, closes the overlay, and focus returns to the editor's textarea.
- The same with a click on a row instead of Return.

## Spec and docs

- `product/specs/clipboard-history.md` — state that where an entry lands does not depend on how the popup was opened, and that an editor buffer receives the paste whether the popup was opened by its chord, by `clip`, or from the right-click menu.

## Out of scope

- The harness focus return, which is the next backlog entry.
