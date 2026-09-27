# Shift+Tab does nothing in an editor tab

**Complexity: 2/10**: the app-wide section-nav listener has to leave the chord alone when the editor's text buffer holds focus. One guard in `useSectionNav`, one attribute on the editor's textarea, and a test that mounts the two together.

## Bug

Shift+Tab does not outdent in an editor tab. The spec says "Tab and Shift+Tab reach the same two commands: Tab indents whenever the selection spans more than one line, and Shift+Tab outdents in every case." With the caret on a line reading `  alpha`, Shift+Tab leaves the text unchanged, while Cmd+[ on the same line outdents it to `alpha`. With only the center section present, the section cycle refocuses the tab that already has focus, so the key looks dead.

## Root cause

`useSectionNav` (`web/src/useSectionNav.ts`) registers a capture-phase `keydown` listener on `globalThis` that claims every unmodified Shift+Tab to cycle focus across application sections. It calls `preventDefault()` and `stopPropagation()` before the event reaches the editor textarea's React `onKeyDown`, so the indenting plugin's outdent binding and the editor's own fallback never run. The listener already stands down while a modal dialog is open. It has no such exception for the editor's buffer.

## Correct behavior

When the editor's text buffer has keyboard focus, Shift+Tab belongs to the editor and outdents, as the editor spec and editor-plugins spec both say. Everywhere else, including other controls inside an editor tab such as its metadata row, Shift+Tab keeps cycling application sections. The keyboard-navigation spec lists the file navigator and harness terminal as surfaces the chord is intercepted ahead of, and it doesn't name the editor, so the editor spec's "in every case" is the one that governs its buffer.

## Reproduction

`web/src/useSectionNav.editor.test.tsx`, written before the fix, renders a real `EditorTab` inside `.app-center` beside `useSectionNav`, the way `App` mounts both. The buffer loads `  alpha\nbeta`. Firing `keydown` with `key: 'Tab', shiftKey: true` on the editor's textarea leaves the first row as `  alpha` on `master`, where the correct result is `alpha`.

## Approach

The editor's textarea declares that it owns the chord with a `data-claims-shift-tab` attribute. `useSectionNav` returns early, before `preventDefault()`, when the event target carries that attribute, the same way it returns early for an open modal. The attribute keeps the app shell from depending on the editor's class names, and any other surface that binds Shift+Tab later can opt out the same way.

## Implementation steps

1. `web/src/editor/EditorTab.tsx`: add `data-claims-shift-tab` to the editor textarea.
2. `web/src/useSectionNav.ts`: return early when the keydown target is an element matching `[data-claims-shift-tab]`, and extend the hook's comment to name that exception.
3. Tests: the regression test below, plus a unit case in `web/src/useSectionNav.test.ts` that a Shift+Tab on an element carrying the attribute is left unprevented.
4. Spec: `product/specs/keyboard-navigation.md`, the Shift+Tab row and the paragraph on what the chord is intercepted ahead of, say it is left to an editor tab's text buffer, where it outdents.
5. Docs: `help.md`'s Shift+Tab row and `documentation/user-documentation/getting-started/keyboard.md`'s section-focus text get the same exception.

## Regression test

`web/src/useSectionNav.editor.test.tsx`, `Shift+Tab in an editor tab` → `outdents the caret's line instead of cycling sections`: mounts the editor with `useSectionNav`, fires Shift+Tab on the textarea, and asserts the first row becomes `alpha` and the section-focus callback was not called. Its sibling, `still cycles sections from outside the editor's buffer`, fires the chord on the metadata row and asserts the section cycle still runs and the text is untouched.

## Out of scope

- A different chord for leaving an editor tab's buffer by keyboard. Clicking another section, or Shift+Tab from any non-buffer control, still moves focus.
- The editor's Tab handling and the indenting plugin, which already behave as specified once the event reaches them.
- The other bugs in the backlog.
