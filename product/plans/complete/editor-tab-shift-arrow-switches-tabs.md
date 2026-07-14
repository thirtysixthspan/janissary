# Shift+Left/Right switches tabs from within the editor tab

**Complexity: 3/10** — a small, precisely-scoped change to one keydown handler, but it trades away
an existing behavior (Shift+Arrow extending the selection horizontally) in favor of the app-wide
tab-switch binding, so the exact scope matters more than the line count.

## Goal

Shift+ArrowLeft / Shift+ArrowRight already switches the active tab everywhere else in the app (the
`moveTab` binding in `useWindowKeys.ts`'s `handleTabShortcuts`). Today it does **not** work while
the editor tab has keyboard focus — the editor's own key handler intercepts it first and uses it to
extend the text selection instead. Make the editor tab defer to the app-wide binding for this one
chord, matching the rest of the app.

## Current behavior (confirmed)

- `web/src/EditorTab.tsx`'s `onKeyDown` calls `e.stopPropagation()` **unconditionally**, before
  even checking whether `actionForKey` recognizes the key:
  ```ts
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing) return;
    e.stopPropagation();
    const action = actionForKey(e);
    if (!action) return;
    e.preventDefault();
    api.apply(action, pageLines());
  };
  ```
  This stops the native event from ever reaching `window`'s keydown listener
  (`useWindowKeys.ts`), regardless of whether the editor itself does anything with the key.
- `web/src/editor/keys.ts`'s `plainAction` maps plain (no Ctrl/Meta) `ArrowLeft`/`ArrowRight` to
  `{ kind: 'move', dir, extend: e.shiftKey }` — so Shift+Arrow today extends the selection one
  character horizontally, and that action fires *before* the event would otherwise bubble (it
  never gets the chance to bubble at all, since propagation was already stopped above).
  `useWindowKeys.ts`'s `handleTabShortcuts` therefore never sees the keystroke while editor focus
  holds it.
- **Existing precedent for resolving exactly this tension:** `web/src/CommandInput.tsx:110` —
  `if (e.shiftKey || e.ctrlKey) return;` — the multi-line command-bar input already bails out of
  its own key handling for any Shift/Ctrl combo (apart from the explicitly-handled Shift+Enter /
  Ctrl+Enter above it), letting those chords bubble to the window handler untouched. The editor
  tab is the one place in the app that doesn't follow this pattern, because its Emacs-style key
  handling consumes essentially everything, including this chord.

## Approach

In `EditorTab.tsx`'s `onKeyDown`, bail out **before** calling `stopPropagation()` for plain
Shift+ArrowLeft/Right (no Ctrl, no Meta), letting the native keydown event bubble to `window`
untouched — exactly the `CommandInput.tsx` pattern. Every other key (including Shift+ArrowUp/Down,
which still extends the selection vertically, and Ctrl/Meta+Arrow variants) is unaffected.

## Implementation steps

1. **`web/src/EditorTab.tsx`** — add an early bail-out at the top of `onKeyDown`:
   ```ts
   const onKeyDown = (e: React.KeyboardEvent) => {
     if (e.nativeEvent.isComposing) return;
     // Shift+Left/Right switches tabs everywhere else in the app (see useWindowKeys); let it
     // bubble there instead of extending the selection, so the editor doesn't shadow that binding.
     if (e.shiftKey && !e.ctrlKey && !e.metaKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) return;
     // Nothing typed in the editor may reach App's global bindings (Ctrl+T, Ctrl+R, Ctrl+arrows).
     e.stopPropagation();
     const action = actionForKey(e);
     if (!action) return;
     e.preventDefault();
     api.apply(action, pageLines());
   };
   ```
   No change to `web/src/editor/keys.ts` — `actionForKey` remains a general-purpose pure mapper
   (it's still correct that *if* something called it with Shift+Arrow, extending would be the
   natural mapping); the actual behavior change belongs at the component's dispatch decision.

## Tests

`web/src/EditorTab.test.tsx`:

1. **Shift+ArrowRight (and Left) is not consumed by the editor** — attach a `window` keydown spy,
   fire `Shift+ArrowRight` on the textarea, and assert the spy was called (propagation reached the
   window-level listener instead of being stopped).
2. **Shift+ArrowRight no longer extends the in-editor selection** — fire the same keystroke and
   assert no `.editor-sel` element is rendered (the editor made no state change).

## Verification

- `./scripts/run.mjs check-diff` — lints changed files, incrementally typechecks, and runs the
  affected web tests.
- Manual: not verifiable in this environment (no browser); the tests above exercise the exact
  propagation and no-op-selection behavior.

## Out of scope

- **Ctrl+ArrowLeft/Right (`reorderTab`)** — the same `onKeyDown` unconditionally stops propagation
  before checking `actionForKey`, so this chord is *also* currently swallowed inside the editor
  tab even though `ctrlAction` doesn't define a mapping for it (returns `null`). That's a parallel
  gap to this issue but a separate one — not mentioned in the reported issue, not touched here.
- Shift+ArrowUp/Down — still extends the selection vertically; the app has no competing
  tab-switch binding on those keys, so there is nothing to defer to.
- Any change to `useWindowKeys.ts` or the `moveTab` binding itself — already correct and already
  used by every other tab type; only the editor's own interception needed to change.
