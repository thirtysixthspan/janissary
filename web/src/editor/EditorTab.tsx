import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import type { EditorView, TabView } from '@shared/protocol';
import type { JanusClient } from '../ws';
import { insertText } from './model';
import { actionForKey } from './keys';
import { visualVerticalHit } from './mouse';
import { useEditor } from './useEditor';
import { useEditorFile } from './useEditorFile';
import { useEditorMouse } from './useEditorMouse';
import { useSyntaxHighlight } from './useSyntaxHighlight';
import { useEditorSync } from './useEditorSync';
import { useEditorSuggest } from './useEditorSuggest';
import { useEditorConnections } from './useEditorConnections';
import { useEditorFind } from './useEditorFind';
import { EditorConnectionsPanel } from './EditorConnectionsPanel';
import { EditorFind } from './EditorFind';
import { handleSuggestKeyDown } from './handleSuggestKeyDown';
import { handleSuggestPillClick } from './handleSuggestPillClick';
import { EditorLines } from './EditorLines';
import { PendingSuggestPanel } from './PendingSuggestPanel';
import { OverwriteConflictDialog } from './OverwriteConflictDialog';
import { EditorMetaRow } from './EditorMetaRow';
import type { EditorDropHandle } from '../drop-handles';
import type { DirtyTabHandle } from '../tab-handles';

// The plain-text editor tab. Mounted persistently by App (like harness tabs) so the buffer, undo
// stacks, cursor, and scroll position survive tab switches; `active` gates focus and the caret.
export const EditorTab = forwardRef<DirtyTabHandle, {
  editor: EditorView;
  tab: TabView;
  client: JanusClient;
  active: boolean;
  dropRef?: React.RefObject<EditorDropHandle | null>;
  onSplit?: () => void;
}>(function EditorTab({ editor, tab, client, active, dropRef, onSplit }, ref) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const caretRef = useRef<HTMLSpanElement>(null);
  const composingRef = useRef(false);
  // The save entry point lives on the file hook, which needs the editor state hook that in turn
  // takes the save callback — so both callbacks reach it through this ref, filled in below.
  const saveRef = useRef<() => Promise<void>>(async () => {});
  const requestSave = () => { void saveRef.current(); };

  const api = useEditor(requestSave);
  const { state } = api;
  const suggest = useEditorSuggest(client, editor.url, api.setState, requestSave);
  const mouse = useEditorMouse(api, bodyRef, () => textareaRef.current?.focus(), suggest);
  const tokens = useSyntaxHighlight(state, editor.name);
  useEditorSync(state, editor.url, client);
  const connections = useEditorConnections(client, tab);
  const file = useEditorFile(client, editor, api);
  saveRef.current = file.save;
  const find = useEditorFind(state?.lines ?? null, active);

  // Every open editor tab stays mounted at once (see the top-of-file comment), so only the
  // currently active one may claim the shared drop handle — otherwise whichever tab rendered last
  // would silently win regardless of which one is actually visible and drop-targetable.
  if (dropRef && active) dropRef.current = { insertAtCaret: (text: string) => api.insert(text) };

  const loaded = state !== null;
  useEffect(() => { if (active && loaded) textareaRef.current?.focus(); }, [active, loaded]);
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
    if (moved) caretRef.current?.scrollIntoView({ block: 'nearest' });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stable refs hold caret/scroll state; active and cursor changes trigger scrolling
  }, [active, state?.cursor.line, state?.cursor.col]);

  const dirtyRef = useRef(file.dirty);
  dirtyRef.current = file.dirty;

  useImperativeHandle(ref, () => ({
    isDirty: () => dirtyRef.current,
    save: async () => { await saveRef.current(); },
    focus: () => textareaRef.current?.focus(),
  }));

  // A viewport's worth of logical lines for PageUp/PageDown, from the measured row line-height.
  const pageLines = () => {
    const body = bodyRef.current;
    if (!body) return 20;
    const lineHeight = Number(getComputedStyle(body).lineHeight.replace('px', '')) || 18;
    return Math.max(1, Math.floor(body.clientHeight / lineHeight) - 1);
  };

  // Wrapped-line-aware ArrowUp/ArrowDown: resolve one visual row from the caret's screen
  // position, falling back to logical-line movement when there's no real layout (e.g. jsdom).
  const resolveVertical = (dir: 'up' | 'down') => {
    const body = bodyRef.current;
    const caret = caretRef.current;
    if (!body || !caret) return null;
    const hit = visualVerticalHit(body, caret, dir);
    return hit ? { line: hit.line, col: hit.col } : null;
  };

  // Highlighting a find result previews it immediately: the caret moves to that line, which the
  // caret effect above then scrolls into view behind the overlay. A cursor-only move is never an
  // undo step, so it seals the coalescing group instead of recording one (like applyKeyAction).
  const selectFindResult = (row: number) => {
    find.setSelected(row);
    const result = find.results[row];
    const current = api.stateRef.current;
    if (!result || !current) return;
    api.sealUndo();
    api.setState({ ...current, cursor: { line: result.index, col: 0 }, anchor: null });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing) return;
    // Nothing typed in the editor may reach App's global bindings (Ctrl+T, Ctrl+R, Ctrl+arrows).
    e.stopPropagation();
    if (handleSuggestKeyDown(e, api, suggest, pageLines())) return;
    const action = actionForKey(e);
    if (!action) return;
    e.preventDefault();
    if (action.kind === 'find') { find.open(); return; }
    api.apply(action, pageLines(), resolveVertical);
  };

  // Typed text and paste both arrive through the hidden textarea (keeps IME composition working).
  // While the agent query line holds focus, route the value into its text instead of the buffer —
  // the keydown path (handleSuggestKeyDown) covers ordinary typing, but paste and IME composition
  // bypass it entirely.
  const flushTextarea = () => {
    const textarea = textareaRef.current;
    if (!textarea || composingRef.current || !textarea.value) return;
    if (suggest.queryLine && suggest.focusTarget === 'query') suggest.setQueryLineState(insertText(suggest.queryLine.state, textarea.value));
    else api.insert(textarea.value);
    textarea.value = '';
  };

  const gutterCh = state ? String(state.lines.length).length + 1 : 2;
  const onMetaMouseUp = () => { if (!globalThis.getSelection()?.toString()) textareaRef.current?.focus(); };

  return (
    <div className="editor-tab" data-doc-shot="editor-view">
      <EditorMetaRow
        editor={editor} dirty={file.dirty} savedFlash={file.savedFlash} error={file.saveError ?? file.loadError}
        onSave={requestSave} onMouseUp={onMetaMouseUp} connectionsButton={connections.connectionsButton}
        onSyncClick={() => client.send({ method: 'resyncEditorTab', params: { url: editor.url } })}
        onSplit={onSplit}
      />
      <PendingSuggestPanel pending={suggest.pending} />
      <div
        className="editor-body"
        ref={bodyRef}
        data-editor-drop
        onMouseDown={mouse.onMouseDown}
        onClick={(e) => { handleSuggestPillClick(e, state, suggest.fireOnLine); }}
      >
        <EditorConnectionsPanel tab={tab} api={connections} />
        <textarea
          ref={textareaRef}
          className="editor-textarea"
          aria-label={`Edit ${editor.name}`}
          onKeyDown={onKeyDown}
          onInput={flushTextarea}
          onCompositionStart={() => { composingRef.current = true; }}
          onCompositionEnd={() => { composingRef.current = false; flushTextarea(); }}
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
          onChangeSelected={selectFindResult}
          onClose={() => { find.close(); textareaRef.current?.focus(); }}
        />
      )}
    </div>
  );
});
