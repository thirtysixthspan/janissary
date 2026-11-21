# Give the editor interaction hook its own test

**Complexity: 1/10** — test-only change: 0 production lines/files/requirements, 10 test scenarios, 0 new production units (p=2.463).

`web/src/editor/useEditorInteractions.ts` owns the precedence chain between suggestion keys, the find overlay, plugin chords, and the editor's own key actions, plus paste and IME composition flush. No test imports it directly; its only coverage comes through `web/src/editor/EditorTab.tsx` in `web/src/editor/EditorTab.test.tsx`. A change to the precedence order can let a plugin chord steal plain Escape from the find overlay or flush a composition into the buffer instead of the suggestion query, and the mounted-tab suite only exercises the branches a rendered tab happens to hit.

## Goal

Add a direct test suite for `useEditorInteractions` that pins each precedence branch and the composition and paste paths. The suite covers the hook in isolation with fake refs and fake `api`, `find`, and `suggest` objects, leaving the existing component and suggestion-key suites as the proof that the hook is wired to the real providers.

## Approach

- Create `web/src/editor/useEditorInteractions.test.ts` following the hook-test style of `web/src/editor/useEditor.test.ts` and the fake-object helpers of `web/src/editor/handleSuggestKeyDown.test.ts`: `renderHook` supplies the React ref, and plain event objects stand in for keyboard and clipboard events.
- Keep the module dependencies real except for `handleSuggestKeyDown`, which is mocked to return `false` so the tests isolate the hook's own precedence chain; `keys.ts` stays real so the cases follow the actual `yieldsToPlugins` and `actionForKey` rules.
- Build a small set of helpers — a fake `EditorApi`, `LineFindApi`, `EditorSuggestApi`, a textarea ref holding a value, and key/paste event factories — and pass them through `renderHook` with per-case overrides.
- Leave `web/src/editor/EditorTab.tsx` and all production code unchanged: this is a test-only change.

## Implementation steps

1. Add `web/src/editor/useEditorInteractions.test.ts` with the helper factories and a `renderInteractions` wrapper around `renderHook`.
2. Cover the find overlay swallowing plain Escape before plugin chords: with `findOpen` true and a plugin key that would claim the chord, assert `find.close()` runs and the plugin key is never consulted.
3. Cover plugin-chord yielding as defined by `yieldsToPlugins`: Shift+Tab and Tab with a multi-line selection go to the plugin when it claims them, while plain Tab with a single-line selection stays with the editor's insert action.
4. Cover paste routing: with the suggestion query focused, a paste updates the query line and not the buffer; without it, the paste goes to `api.paste`.
5. Cover composition flush: `flushTextarea` is a no-op while composing and leaves the textarea value intact, and `endComposition` flushes that value to the buffer (and to the query line when the query has focus).
6. Cover the early return while `overlayOpen` is set: an editor binding is prevented but neither stops propagation nor reaches the find, plugin, or editor-apply branches.
7. Cover `selectFindResult` sealing undo and moving the cursor to the chosen result.

## Tests

- New `web/src/editor/useEditorInteractions.test.ts` with the cases above.
- `web/src/editor/EditorTab.test.tsx` and `web/src/editor/handleSuggestKeyDown.test.ts` remain unchanged and keep passing.
- Run `$janissary/scripts/run.mjs check-diff` and confirm lint, typecheck, and the client tests are clean.

## Spec

None — this adds coverage for behavior that already exists; no user-visible behavior changes.

## Out of scope

Changing the hook's precedence logic, the component wiring, the plugin-key window handler, or any production behavior. Adding coverage for the suggestion-key module (`handleSuggestKeyDown`) and the mounted tab (`EditorTab`), which already have their own suites.
