# Editor Tab Deduplication

**Complexity:** 3/10

## Goal

Opening a file that already has an editor tab open should focus the existing tab instead of creating a duplicate.

## Approach

In `TabManager.openEditorTab()`, before creating a new tab, search `this.tabs` for an existing editor tab whose `editor.path` matches `view.path`. If found, focus it via `setActiveTab()` and update its `editor.line` if the new request specifies one. Do not start a new file watcher — the existing one is already active.

This mirrors the file-tree dedup pattern in `FileTreeManager.open()`.

## Implementation

### `src/tab-manager.ts`

```ts
openEditorTab(view: EditorView): void {
  const existing = this.tabs.find((t) => t.editor?.path === view.path);
  if (existing) {
    if (view.line !== undefined) existing.editor = { ...existing.editor, line: view.line };
    this.setActiveTab(this.tabs.indexOf(existing));
    messageBus.emit('state', { type: 'dirty' });
    return;
  }
  const { tabs, activeTab } = addEditorTab(this.tabs, this.activeTab, view);
  this.tabs = tabs;
  this.activeTab = activeTab;
  this.managers.editorWatch.watch(tabs[activeTab].label, view.path);
  messageBus.emit('state', { type: 'dirty' });
}
```

## Tests

Add a test to `src/tab-manager.test.ts`:

- Open an editor tab for a file path, then open the same path again → verify no new tab is created and the active tab index points to the existing one.
- Open with a line number on the second call → verify the existing tab's `editor.line` is updated.

## Spec

Update `specs/editor-tab.md` to state that opening an already-open file focuses the existing tab.

## Out of scope

- Deduplication for markdown or image tabs (they are single-use viewers, not editors).
- Changing the `/open/<id>` URL registration (extraneous but harmless).
