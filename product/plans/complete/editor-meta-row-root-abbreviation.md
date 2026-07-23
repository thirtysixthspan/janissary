# $root abbreviation in the editor metadata bar

**Complexity: 2/10** — one field gets passed through the existing `shorten` callback in the TabView projection; no new logic.

## Goal

The editor tab's metadata row shows the file's full, unabbreviated absolute path (`web/src/editor/EditorMetaRow.tsx:26`, `{editor.path}`) — e.g. `/Users/derrick/dev/janissary/product/backlog/features.md` — while every other path shown in the app (shell prompts, connections panel, file-tree root) uses the `$root` abbreviation (see `root-path.md`). After this fix, the editor metadata bar shows the abbreviated path, e.g. `$root/product/backlog/features.md`.

## Approach

`abbreviatePath` (`src/paths.ts:33`) already implements the `$root`/`~` shortening, exposed as `TabManager.shorten` (`src/tab/manager.ts:278`) and threaded into `buildTabView` (`src/tab/view.ts`) as the `shorten` parameter — already used for `cwd`, transcript `bufferLines[].cwd`, and `files.root`. `tab.editor` is currently spread into `TabView` unmodified (`src/tab/view.ts:47`, `editor: tab.editor,`), so its `path` reaches the client raw.

Shorten it in the same projection, the same way `files.root` is shortened while `files.absoluteRoot` keeps the real path: since no client code reads `editor.path` for anything other than display (only `EditorMetaRow.tsx:26` reads it, confirmed by search), the projected copy's `path` can simply be replaced with the shortened value — no need for a parallel `absolutePath` field, and the server-side `Tab.editor.path` (used internally, e.g. `open-file-manager.ts`'s tab lookup by path) is untouched since this only affects the wire copy built in `buildTabView`.

## Implementation steps

1. `src/tab/view.ts`: change `editor: tab.editor,` to `editor: tab.editor ? { ...tab.editor, path: shorten(tab.editor.path) } : undefined,`.
2. Run `./scripts/run.mjs check-diff`.

## Tests

`src/tab/view.test.ts`:

- Update the existing `'never includes editorDraft in the TabView sent to clients'` test: since it passes `(p) => p` as `shorten`, `view.editor` still equals `tab.editor` unchanged — no assertion change needed there, but rename isn't required either.
- Add a new test: `'abbreviates the editor path using the given shorten callback'` — set `tab.editor = { name: 'notes.txt', path: '/Users/derrick/project/notes.txt', size: '8 B', url: '/open/1' }`, call `buildTabView` with a `shorten` that maps that path to `'$root/notes.txt'`, and assert `view.editor?.path` equals `'$root/notes.txt'` while `view.editor?.name` and other fields are unchanged.

## Out of scope

- Adding an `absolutePath` field to `EditorView` — nothing on the client needs the real path today.
