# Make metadata text selectable

**Complexity: 3/10** — most metadata bars already rely on browser defaults, but the shared file
metadata style disables selection and the editor actively cancels metadata mouse-down events. The
fix is a focused CSS and editor-event adjustment with no state or protocol changes.

## Goal

Allow users to drag-select and copy text from metadata bars throughout the application without
breaking the editor's focus protection for ordinary clicks.

## Approach

Give every metadata text container an explicit `user-select: text` rule. Replace the editor
metadata header's selection-blocking mouse-down handler with a mouse-up handler: when no text is
selected, a plain click restores focus to the hidden editor textarea; when a drag produced a text
selection, leave focus alone so the browser selection survives.

## Implementation

1. **`web/src/theme.css` and `web/src/EditorTab.tsx`** — enable text selection for agent, file,
   image/Markdown/editor, page, and monitor metadata containers, and reconcile editor metadata
   selection with its click-to-refocus behavior.
2. **`web/src/theme.test.ts` and `web/src/EditorTab.test.tsx`** — verify the shared selection rule,
   that editor metadata no longer cancels mouse-down, that plain clicks restore editor focus, and
   that a completed text selection does not restore focus.
3. **`product/specs/tabs.md` and `product/specs/editor-tab.md`** — specify selectable metadata
   text and the editor's selection-aware focus behavior.
4. **`documentation/user-documentation/getting-started/tabs.md`** — note that metadata text can be
   selected and copied.

## Tests

- The theme explicitly enables text selection on all metadata text containers.
- Mouse-down on editor metadata is not canceled, allowing native drag selection.
- A plain mouse-up on editor metadata returns focus to the editor textarea.
- A mouse-up with selected metadata text leaves focus outside the editor so the selection remains.

## Out of scope

- Making action-button icons or file-tree rows selectable.
- Adding a custom Copy button or clipboard API integration.
- Changing text selection in transcripts, editors, terminals, or rendered content bodies.
