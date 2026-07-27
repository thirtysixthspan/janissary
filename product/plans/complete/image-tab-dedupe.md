# Focus an already-open image tab instead of opening a duplicate

**Complexity: 2/10** — mirrors an existing, working pattern (`openEditorTab`'s path-based de-dupe) onto a sibling function. No new data model, no UI changes.

## Goal

`open <image>` currently always creates a new image tab, even when that image is already open in a tab (`product/backlog/issues.md`: "a single image may only be opened in a single image tab. opening an image already open in a tab will focus the pre-existing tab, but not open another."). Editor tabs already implement exactly this behavior (`product/specs/editor-tab.md:20-21`, `src/tab/openers.ts:29-43`): opening a file already open in an editor tab focuses the existing tab rather than duplicating it. Image tabs should behave the same way.

## Approach

`openImageTab` in `src/tab/openers.ts:21-23` unconditionally calls `activate(target, addImageTab(...))`. `openEditorTab` (same file, lines 29-43) instead first searches `target.tabs` for an existing tab whose `editor.path` matches, and if found just calls `target.setActiveTab(...)` and returns instead of creating a new tab.

Apply the same pattern to `openImageTab`, matching on `t.image?.path === image.path` (the `ImageView.path` field, `src/tab/types.ts:63-72`, is the absolute path of the file — the natural identity key, same role `editor.path` plays for editor tabs).

## Implementation steps

1. In `src/tab/openers.ts`, rewrite `openImageTab` to search `target.tabs` for a tab with `t.image?.path === image.path`. If found, call `target.setActiveTab(target.tabs.indexOf(existing))`, emit the `state`/`dirty` message bus event (matching `openEditorTab`'s side effect), and return. Otherwise fall through to the existing `activate(target, addImageTab(target.tabs, target.activeTab, image))` behavior.

## Tests

Add to `src/tab/manager.test.ts`, mirroring the existing `openEditorTab` dedupe tests (lines 113–123, 135–140):

- `openImageTab deduplicates by path and focuses the existing tab` — open the same path twice, assert `tm.tabs.length` and `tm.activeTab` are unchanged by the second call.
- `openImageTab creates a new tab when the path differs` — open two different image paths, assert both tabs exist.

Run `./scripts/run.mjs check-diff` to confirm.

## Spec updates

- `product/specs/open.md:76` (the `open <image>` — image tab section) — add a sentence stating that opening an image already open in an image tab focuses the existing tab instead of creating a duplicate, mirroring the equivalent editor-tab sentence in `product/specs/editor-tab.md:20-21`.

## Docs

- Checked `help.md` — no per-behavior detail about image tab de-duplication; no update needed.
- Checked `documentation/user-documentation/` — no page documents duplicate-image-tab behavior; no update needed.

## Out of scope

- Editor tab, markdown tab, or page tab de-dupe logic — already implemented, unaffected.
- Any change to how images are rendered, sized, or zoomed within the tab.
