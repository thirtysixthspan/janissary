import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { EditorView, TabView } from '@shared/protocol';
import type { JanusClient } from '../ws';
import { useEditor } from './useEditor';
import { useEditorFile } from './useEditorFile';
import { useEditorMouse } from './useEditorMouse';
import { useSyntaxHighlight } from './useSyntaxHighlight';
import { useEditorSync } from './useEditorSync';
import { useEditorSuggest } from './useEditorSuggest';
import { useEditorConnections } from './useEditorConnections';
import { useEditorFind } from './useEditorFind';
import { useEditorPlugins } from './plugins/useEditorPlugins';
import { useEditorInteractions } from './useEditorInteractions';
import { useEditorScrollRetention } from './useEditorScrollRetention';
import { selectionsText } from './model';
import { keepCaretRowVisible } from './scroll';
import { EditorConnectionsPanel } from './EditorConnectionsPanel';
import { EditorFind } from './EditorFind';
import { handleSuggestPillClick } from './handleSuggestPillClick';
import { EditorLines } from './EditorLines';
import { PendingSuggestPanel } from './PendingSuggestPanel';
import { OverwriteConflictDialog } from './OverwriteConflictDialog';
import { EditorMetaRow } from './EditorMetaRow';
import { commitAfterSave, renameAndRefocus, sendResync } from './editor-file-commands';
import { useEditorDrop } from './useEditorDrop';
import type { DirtyTabHandle } from '../shared/tab/handles';

// The plain-text editor tab. Mounted persistently by App (like harness tabs) so the buffer, undo
// stacks, cursor, and scroll position survive tab switches; `active` gates focus and the caret.
export const EditorTab = forwardRef<DirtyTabHandle, {
  editor: EditorView;
  tab: TabView;
  client: JanusClient;
  active: boolean;
  // Whether the tab's body is on screen at all. In a split it can be shown without being the
  // focused tab, and hidden while the focus sits in the other pane, so this is what the scroll
  // retention and the file-navigator drop handle key on rather than `active`. A standalone render is
  // on screen.
  visible?: boolean;
  onSplit?: () => void;
}>(function EditorTab({ editor, tab, client, active, visible = true, onSplit }, ref) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const caretRef = useRef<HTMLSpanElement>(null);
  // The save entry point lives on the file hook, which needs the editor state hook that in turn
  // takes the save callback — so both callbacks reach it through this ref, filled in below.
  const saveRef = useRef<() => Promise<void>>(async () => {});
  // The save button, Ctrl+S, and the suggest panel all fire and forget. `save` rejects when the
  // write did not happen, and each of those outcomes is already on screen — the error in the
  // metadata row, the overwrite prompt over the body — so the rejection is consumed rather than
  // left to surface as an unhandled one. The imperative handle below still propagates it, because
  // the close guard is the caller that has to know.
  const requestSave = () => { void saveRef.current().catch(() => {}); };

  const api = useEditor(requestSave);
  const { state } = api;
  const suggest = useEditorSuggest(client, editor.url, api.setState, api.replace, requestSave);
  const mouse = useEditorMouse(api, bodyRef, () => textareaRef.current?.focus(), suggest);
  const tokens = useSyntaxHighlight(state, editor.name);
  useEditorSync(state, editor.url, client);
  const connections = useEditorConnections(client, tab);
  const file = useEditorFile(client, editor, api);
  saveRef.current = file.save;
  const find = useEditorFind(state?.lines ?? null, active);
  const pluginKey = useEditorPlugins(client, editor.url, api, editor.name);
  const interactions = useEditorInteractions({ bodyRef, caretRef, textareaRef, api, suggest, find, pluginKey });

  useEditorDrop(tab.label, visible, textareaRef, api.insert);

  const onBodyScroll = useEditorScrollRetention(bodyRef, visible);

  const loaded = state !== null;
  // While the metadata row's rename session is open (a new file auto-starts one), the loaded
  // buffer must not steal the keyboard back from the rename input. The flag starts at the tab's
  // own newFile state: the loaded effect would otherwise fire before the session reports in.
  const [renaming, setRenaming] = useState(editor.newFile === true);
  // `preventScroll` because the textarea is pinned to the top of the scrollport (see theme.css): a
  // plain focus() on a scrolled buffer drags it back into view, undoing the restored position.
  useEffect(() => { if (active && loaded && !renaming) textareaRef.current?.focus({ preventScroll: true }); }, [active, loaded, renaming]);
  const initialScrollDone = useRef(false);
  const lastCursorRef = useRef<{ line: number; col: number } | null>(null);
  useEffect(() => {
    if (!active || !state) return;
    if (!initialScrollDone.current) {
      initialScrollDone.current = true;
      lastCursorRef.current = { line: state.cursor.line, col: state.cursor.col };
      caretRef.current?.scrollIntoView({ block: editor.line === undefined ? 'nearest' : 'center' });
      return;
    }
    // Reactivating the tab re-runs this effect even when the cursor hasn't moved since it was
    // last visible; only scroll when the cursor position actually changed, so returning to a tab
    // never overrides a scroll position the user set deliberately while it was inactive.
    const last = lastCursorRef.current;
    const moved = !last || last.line !== state.cursor.line || last.col !== state.cursor.col;
    lastCursorRef.current = { line: state.cursor.line, col: state.cursor.col };
    // The whole screen row the caret lands on comes into view with it, not just the caret's own box:
    // a row is taller than the caret, so bounding the caret alone leaves the line it is on clipped
    // at the edge the move came from — below the fold, going down.
    if (moved && bodyRef.current && caretRef.current) keepCaretRowVisible(bodyRef.current, caretRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stable refs hold caret/scroll state; active and cursor changes trigger scrolling
  }, [active, state?.cursor.line, state?.cursor.col]);

  const dirtyRef = useRef(file.dirty);
  dirtyRef.current = file.dirty;

  useImperativeHandle(ref, () => ({
    isDirty: () => dirtyRef.current,
    save: async () => { await saveRef.current(); },
    focus: () => textareaRef.current?.focus(),
  }));

  const gutterCh = state ? String(state.lines.length).length + 1 : 2;
  const selectionText = state ? selectionsText(state) : '';
  const onMetaMouseUp = () => { if (!globalThis.getSelection()?.toString()) textareaRef.current?.focus(); };
  // The metadata row's rename input: Enter accepted or Escape keeps the caret at the top of the
  // editor buffer.
  const focusBuffer = () => { textareaRef.current?.focus(); };
  const commitEditorName = (next: string) => { renameAndRefocus(client, editor.url, next, focusBuffer); };
  const commitOrigin = () => { void commitAfterSave(client, () => saveRef.current(), editor.url, editor.name); };

  return (
    <div className="editor-tab" data-doc-shot="editor-view">
      <EditorMetaRow
        editor={editor} dirty={file.dirty} savedFlash={file.savedFlash} error={file.saveError ?? file.loadError}
        onSave={requestSave} onMouseUp={onMetaMouseUp} connectionsButton={connections.connectionsButton}
        onSyncClick={() => { sendResync(client, editor.url); }}
        onSplit={onSplit}
        onRename={commitEditorName}
        onRenameCancel={focusBuffer}
        onRenameEditingChange={setRenaming}
        onCommitOrigin={commitOrigin}
      />
      <PendingSuggestPanel pending={suggest.pending} />
      <div
        className="editor-body"
        ref={bodyRef}
        data-editor-drop={tab.label}
        data-editor-selection={selectionText}
        onScroll={onBodyScroll}
        onMouseDown={mouse.onMouseDown}
        onContextMenu={(event) => { if (!selectionText) event.preventDefault(); }}
        onClick={(e) => { handleSuggestPillClick(e, state, suggest.fireOnLine); }}
      >
        <EditorConnectionsPanel tab={tab} api={connections} />
        <textarea
          ref={textareaRef}
          className="editor-textarea"
          aria-label={`Edit ${editor.name}`}
          onKeyDown={interactions.onKeyDown}
          onPaste={interactions.onPaste}
          onInput={interactions.flushTextarea}
          onCompositionStart={interactions.startComposition}
          onCompositionEnd={interactions.endComposition}
        />
        {state && (
          <EditorLines
            state={state}
            tokens={tokens}
            suggest={suggest}
            active={active}
            gutterCh={gutterCh}
            caretRef={caretRef}
          />
        )}
      </div>
      {file.conflictOpen && (
        <OverwriteConflictDialog onSave={file.overwrite} onCancel={file.dismissConflict} />
      )}
      {find.findOpen && (
        <EditorFind
          query={find.query} onChangeQuery={find.setQuery}
          results={find.results} selected={find.selected}
          onChangeSelected={interactions.selectFindResult}
          onClose={() => { find.close(); textareaRef.current?.focus(); }}
        />
      )}
    </div>
  );
});
