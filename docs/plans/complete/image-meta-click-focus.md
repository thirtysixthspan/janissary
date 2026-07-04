# Prevent metadata header clicks from stealing editor focus

**Complexity: 1/10** — one `onMouseDown` handler on the `.image-meta` div in `EditorTab.tsx`.

## Goal

Clicking the metadata header (`.image-meta`) in the editor tab must not steal focus from the hidden textarea. The user stays in the editor and can continue typing immediately after clicking the file name, size, or path header.

## Background

The previous `editor-tab-focus-protection` plan added `user-select: none` to `.image-meta` (CSS) and an early `e.preventDefault()` in `useEditorMouse.ts` for clicks on empty editor-body space. Those changes prevent text-selection-based focus changes but do not prevent the browser from shifting focus away from the textarea when the user mousedowns on the metadata header — a real-browser effect that jsdom tests don't simulate.

## Approach

Add an `onMouseDown` handler to the `.image-meta` div in `EditorTab.tsx` that calls `e.preventDefault()` and `textareaRef.current?.focus()`. This mirrors the existing defensive pattern on `.editor-body` (whose `onMouseDown` handler in `useEditorMouse.ts` calls `focus()` as its first action).

## Implementation steps

1. **Add `onMouseDown` handler** on the `.image-meta` div in `web/src/EditorTab.tsx` — prevent default and focus the textarea ref.

2. **Run `./scripts/run.mjs check-diff`**.

## Tests

The existing test `'clicking the metadata header does not steal focus from the textarea'` in `EditorTab.test.tsx` already covers this scenario. No new tests needed — the current test verifies the active element stays on the textarea, which the new handler enforces.

## Out of scope

- ImageTab / MarkdownTab: those tabs have no textarea and no keyboard-input editing, so the focus issue does not apply.
- The `.editor-body` click handling is already correct.

## Verification

`./scripts/run.mjs check-diff` must pass clean.
