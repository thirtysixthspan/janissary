# Keep editor focused on clicks outside text lines

**Complexity: 1/10** — move one `focus()` call before the early return in `useEditorMouse.ts`.

## Goal

Clicking anywhere within the editor body (the scrollable area that shows text lines) keeps the hidden textarea focused so keyboard input continues to work. Currently, clicking on empty space below the last line silently disarms the editor — the caret stays visible but keystrokes go nowhere until the user clicks a text line again.

## Root cause

`useEditorMouse.ts` calls `hitFromEvent()` to determine if a click landed on a text line. When `hitFromEvent` returns null (empty space, no `.editor-row` under the click), the handler returns early before `focus()` is called. The hidden textarea loses focus. The browser's default mousedown behavior (text selection) was also not prevented, but that's harmless on empty space.

## Approach

Move the `focus()` call above the `if (!s || !hit) return;` guard so that any mousedown within `.editor-body` refocuses the hidden textarea. The cursor position doesn't change (no state update occurs when `hit` is null), but keyboard input is available immediately after the click.

## Implementation steps

1. **Hoist `focus()` call** in `web/src/editor/useEditorMouse.ts` — move from line 61 to before the early return on line 58.

2. **Add test** in `web/src/EditorTab.test.tsx` — verify that clicking empty space below text lines still allows keyboard input (cursor doesn't move but the editor accepts keystrokes).

3. **Run `./scripts/run.mjs check-diff`** after each step.

## Tests

- `web/src/EditorTab.test.tsx` — new test: clicking the empty area of the editor body does not move the cursor but keeps the editor accepting input (focus maintained).

## Out of scope

- Metadata header clicks (`.image-meta` is outside `.editor-body`; VS Code convention is that clicking tab metadata does not focus the editor)
- No changes to cursor positioning logic or scroll behavior

## Verification

`./scripts/run.mjs check-diff` must pass clean.
