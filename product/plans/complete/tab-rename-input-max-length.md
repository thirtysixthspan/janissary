# Tab rename input accepts 50 characters and grows only as typed

**Complexity: 3/10** — a constant swap plus an input-sizing change, touching a small,
well-covered surface (`TabItem`, `TabManager.renameTab`, `renameEditorTab`).

## Goal

When renaming a tab (double-click the active tab's label), the edit field currently caps
input at `tabNameMaxLength` (the *display* truncation length, default 16) — far shorter
than a reasonable file name. Renaming should accept up to 50 characters regardless of the
display truncation length, and the input's on-screen width should start snug and grow only
as the user types, rather than reserving space for the full 50 characters up front.

## Root cause

`tabNameMaxLength` is a single config value doing double duty: it both truncates the tab
strip's display label and caps the rename `<input>`'s `maxLength`/`onChange` slicing
(`web/src/TabItem.tsx:54,58`), and it caps the persisted rename on the server
(`src/tab/manager.ts:238,245`, `src/tab/rename-editor.ts:19`). Editor-tab renames go
straight to a file-system rename (`renameSync`), so capping at the display length also
silently truncates the actual file name.

## Approach

Introduce a separate constant for the rename input's character limit, decoupled from the
display truncation length, and use it everywhere a rename value is capped (client input,
plain-tab title rename, editor-tab file rename). Size the input to its content instead of a
fixed width so it starts small and grows with typing.

## Implementation steps

1. **`src/config.ts`** — add `export const TAB_RENAME_MAX_LENGTH = 50;` alongside
   `DEFAULT_TAB_NAME_MAX_LENGTH`.
2. **`web/src/TabItem.tsx`** — import `TAB_RENAME_MAX_LENGTH` from `@shared/config`. Use it
   for the rename `<input>`'s `maxLength` and the `onChange` slice instead of
   `tabNameMaxLength` (display truncation still uses `tabNameMaxLength` for the non-editing
   label span — unchanged). Add `size={Math.max(draft.length, 1)}` to the input so its
   rendered width tracks the current draft length instead of a fixed `10em`.
3. **`web/src/theme.css`** — drop the fixed `width: 10em;` on `.tab-rename-input` now that
   `size` drives the width; keep the rest of the rule (font/color/background/border/padding)
   unchanged.
4. **`src/tab/manager.ts`** — `renameTab`: pass `TAB_RENAME_MAX_LENGTH` (imported from
   `../config.js`) to `renameEditorTab` instead of `getConfig().tabNameMaxLength`, and use
   `TAB_RENAME_MAX_LENGTH` for the plain-tab `title` slice instead of
   `getConfig().tabNameMaxLength`.
5. **`src/tab/rename-editor.ts`** — no signature change; it already takes `maxLength` as a
   parameter, so it now receives `TAB_RENAME_MAX_LENGTH` from its caller.

## Tests

- **`web/src/TabStrip.test.tsx`** — update the existing "truncates typed input to
  tabNameMaxLength" test: rename it to reflect the new 50-char cap, drop reliance on the
  `tabNameMaxLength` prop for this behavior, and assert typing more than 50 characters is
  truncated to 50 on commit (independent of a small `tabNameMaxLength` passed for display).
  Add a test asserting the input's `size` attribute grows as the draft grows (e.g. seed a
  short label, type additional characters, assert `size` increases to match the new length).
- **`src/tab/rename-editor.test.ts`** (or wherever `renameEditorTab` is covered) — assert a
  title longer than the old display max (16) but within 50 chars is no longer truncated when
  renaming an editor tab.
- **`src/tab/manager.test.ts`** — assert `renameTab` on a plain tab allows a title up to 50
  characters even when `tabNameMaxLength` is configured smaller.

## Out of scope

- Changing `tabNameMaxLength` itself or the tab strip's display truncation behavior.
- Any change to how the full (untruncated) name is seeded into the rename input on
  double-click — that was already fixed separately.
