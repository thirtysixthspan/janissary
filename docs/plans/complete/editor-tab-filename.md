# Editor tab filename

**Complexity: 2/10** — one hardcoded string replaced with a dynamic value, plus a one-line truncation in the creator function; two source files touched, no new modules.

## Goal

Editor tabs display the edited file's basename as the tab title instead of the hardcoded `"editor"` string. The filename is truncated to the configured `tabNameMaxLength` (default 16).

## Background

`makeEditorTab` in `src/tab.ts:49` currently sets `title: 'editor'` — every editor tab shows the same name regardless of the file being edited. The `EditorView` payload already carries `name` (the basename, e.g. `"config.yaml"`), which the editor body header displays. The tab strip renders `tab.title ?? tab.label` in `TabItem.tsx:58`, so setting `title` to the filename is all that's needed for the strip to show it.

## Approach

1. In `src/tab.ts`, change `makeEditorTab`'s `title` from `'editor'` to `editor.name`.
2. In `src/tab-creators.ts` `addEditorTab`, after creating the tab, truncate the title to `getConfig().tabNameMaxLength` following the same pattern as `TabManager.renameTab` (`src/tab-manager.ts:155`).

## Implementation steps

1. **Set title to filename in `makeEditorTab`** — change `title: 'editor'` to `title: editor.name` in `src/tab.ts:49`.
2. **Truncate to max length in `addEditorTab`** — import `getConfig` in `src/tab-creators.ts`, and after `makeEditorTab` returns, slice the title to `tabNameMaxLength`.
3. **Update tests** — `src/tab-creators.test.ts:9-13` asserts `title: 'editor'`; update to expect the filename `view.name`. Add a test case: a long filename is truncated to max length.
4. **Run `./scripts/run.mjs check-diff`** after each change.

## Testing

- `src/tab-creators.test.ts` — update existing `makeEditorTab` assertion to expect `title: 'notes.txt'` instead of `'editor'`. Add test: a filename longer than `tabNameMaxLength` (e.g. `'a-very-long-config-file-name.json'`) is truncated in the title (requires mocking `getConfig` or setting a lower max length).

## Out of scope

- The `rename` command and inline edit already enforce `tabNameMaxLength` — no change needed there.
- The web UI already renders `tab.title ?? tab.label` — no client-side change needed.

## Verification

`./scripts/run.mjs check-diff` must pass clean. Manual: open a file via `edit <file>` or `open <text file>`; verify the tab strip shows the filename (basename) truncated to the configured max length.
