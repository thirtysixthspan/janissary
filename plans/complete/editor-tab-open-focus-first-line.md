# Lock in: opening a file in a new editor tab focuses it with the cursor on the first line

**Complexity: 2/10** — investigation found the described behavior already works; the fix is
regression tests that lock it in (currently untested) plus a spec clarification (currently
under-specified), not a code change.

## Goal

"When opening a file in a new editor tab, the editor tab should get focus, and keyboard focus
should be on the first line." Verify this is true today, and if so, add coverage so a future
change can't silently regress it, and make the spec say so explicitly.

## Investigation (verified)

Traced the full path from `edit <file>` through to the DOM:

- **Tab-level focus:** `openEditorTab`'s new-tab branch (`src/tab/openers.ts`) calls
  `target.applyOpenResult(result)`, which sets `TabManager.activeTab` to the new tab immediately —
  already true, and already documented (`specs/editor-tab.md:14`, "Focus moves to the new editor
  tab").
- **Keyboard focus:** `web/src/MountedViewLayers.tsx:56` passes `active={t.label === current.label}`
  to `EditorTab`, which is true from the new tab's first render (the tab-creation and
  activeTab-change arrive in the same state broadcast). `EditorTab.tsx:104`:
  `useEffect(() => { if (active && loaded) textareaRef.current?.focus(); }, [active, loaded])`
  fires once the fetched content resolves (`loaded = state !== null`), calling `.focus()` on the
  hidden textarea.
- **First-line cursor:** the load path (`EditorTab.tsx:66`) calls
  `api.load(text, editor.line === undefined ? undefined : editor.line - 1)`. With no explicit line
  (the plain `edit`/`open` case), `fromText(text, undefined)` (`web/src/editor/model.ts:17-21`)
  sets `cursor: { line: 0, col: 0 }` — the first line.
- **The one plausible race** — `web/src/useFocusOnTabSwitch.ts` focuses the command-bar input
  whenever `activeTab` changes, for any non-harness/shell tab, including a brand-new editor tab,
  and that effect can fire in the same commit as the new tab's mount (before its content has
  loaded). Traced through: this effect's dependency array is `[activeTab]` only, so it fires once,
  at tab-creation time, when `loaded` is still false — at that point `EditorTab`'s own effect
  no-ops (guarded by `loaded`), so there's no fight over focus in that commit. When the fetch later
  resolves, `EditorTab`'s effect re-fires (its own dependency, `loaded`, changed) and focuses the
  textarea; `useFocusOnTabSwitch` does not re-fire (its only dependency, `activeTab`, hasn't
  changed again), so it can't re-steal focus afterward.
- Confirmed empirically with two throwaway test harnesses (discarded, not part of this fix): one
  rendering `EditorTab` alone and asserting `document.activeElement` after load, one composing
  `MountedViewLayers` with `useFocusOnTabSwitch` to reproduce the exact tab-switch-plus-mount
  sequence a real `edit` command produces. Both passed on the very first try, with no code changes.

**Conclusion:** the described behavior is already correct. Nothing in `EditorTab.test.tsx` today
asserts it, though — every existing focus test starts from an already-focused textarea and checks
it *stays* focused (`'keeps the textarea focused when clicking...'`,
`'clicking the metadata header does not steal focus...'`). None exercises the auto-focus-on-load
path itself, and none asserts where the cursor starts. `specs/editor-tab.md` documents tab-level
focus (line 14) but is silent on textarea-level keyboard focus and the first-line cursor default.

## Approach

Add the missing regression coverage and the missing spec sentence — no source changes.

## Implementation steps

1. **`web/src/EditorTab.test.tsx`** — two new tests, using the existing `renderLoaded` helper
   (which already renders with `active` and awaits `waitFor(() => screen.getByText('line one'))`,
   i.e. exactly the auto-focus-on-load path):
   ```ts
   it('auto-focuses the textarea once the file has loaded', async () => {
     const { client } = makeClient();
     await renderLoaded(client);
     expect(document.activeElement).toBe(textarea());
   });

   it('starts the cursor on the first line when opened without a target line', async () => {
     const { client } = makeClient();
     const { container } = await renderLoaded(client);
     const current = container.querySelector('.editor-row-current .editor-content');
     expect(current?.textContent).toBe('line one');
   });
   ```

2. **`specs/editor-tab.md`** — extend the existing focus sentence (line 14) to say what "focus"
   means at the keyboard level, and add the first-line default:
   ```
   Focus moves to the new editor tab, and keyboard focus lands in the buffer once its content has
   loaded, with the cursor on the first line (or the requested line, if one was given).
   ```

## Tests

Covered in Implementation step 1 — the two new `EditorTab.test.tsx` cases are the whole test
surface for this fix.

## Verification

- `./scripts/run.mjs check-diff` — lints changed files, incrementally typechecks, and runs the
  affected web tests.
- Manual: not verifiable in this environment (no browser); the new automated tests exercise the
  exact load-then-focus and cursor-default paths described.

## Out of scope

- Any change to `useFocusOnTabSwitch.ts`, `EditorTab.tsx`, or the tab-opener code — investigation
  found no defect; only test/spec gaps.
- The dedup case (reopening an already-open file without a line number) — per
  `specs/editor-tab.md:15-17`, the cursor deliberately stays wherever it was left; this issue is
  about a genuinely *new* editor tab.
- The other open editor-tab-focus issue in `work/issues.md` ("Shift+arrow left/right should
  switch tabs while in the editor tab") — a separate issue, not touched here.
