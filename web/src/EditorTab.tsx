import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import type { EditorView, TabView } from '@shared/protocol';
import type { JanusClient } from './ws';
import { insertText, toText } from './editor/model';
import { actionForKey } from './editor/keys';
import { visualVerticalHit } from './editor/mouse';
import { useEditor } from './editor/useEditor';
import { useEditorMouse } from './editor/useEditorMouse';
import { useSyntaxHighlight } from './editor/useSyntaxHighlight';
import { useEditorSync } from './editor/useEditorSync';
import { useEditorSuggest } from './editor/useEditorSuggest';
import { useEditorConnections } from './editor/useEditorConnections';
import { EditorConnectionsPanel } from './editor/EditorConnectionsPanel';
import { handleSuggestKeyDown } from './editor/handleSuggestKeyDown';
import { handleSuggestPillClick } from './editor/handleSuggestPillClick';
import { EditorLines } from './editor/EditorLines';
import { PendingSuggestPanel } from './editor/PendingSuggestPanel';
import { OverwriteConflictDialog } from './OverwriteConflictDialog';
import { EditorMetaRow } from './editor/EditorMetaRow';

export type EditorTabHandle = { isDirty(): boolean; save(): Promise<void>; focus(): void };

// The plain-text editor tab. Mounted persistently by App (like harness tabs) so the buffer, undo
// stacks, cursor, and scroll position survive tab switches; `active` gates focus and the caret.
export const EditorTab = forwardRef<EditorTabHandle, { editor: EditorView; tab: TabView; client: JanusClient; active: boolean }>(function EditorTab({ editor, tab, client, active }, ref) {
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [conflictOpen, setConflictOpen] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const caretRef = useRef<HTMLSpanElement>(null);
  const composingRef = useRef(false);
  // Set once a watched external change lands while the buffer is dirty; cleared on a successful
  // save. Drives the overwrite-conflict prompt instead of a normal save.
  const conflictPendingRef = useRef(false);

  const api = useEditor(() => { void save(); });
  const { state } = api;
  const mouse = useEditorMouse(api, bodyRef, () => textareaRef.current?.focus());
  const tokens = useSyntaxHighlight(state, editor.name);
  useEditorSync(state, editor.url, client);
  const suggest = useEditorSuggest(client, editor.url, api.setState), connections = useEditorConnections(client, tab);

  const writeToDisk = async (text: string) => {
    setSaveError(null);
    const error = await client.saveFile(editor.url, text);
    if (error) { setSaveError(error); return; }
    setLastSaved(text);
    conflictPendingRef.current = false;
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1500);
  };

  const save = async () => {
    const s = api.stateRef.current;
    if (!s) return;
    if (conflictPendingRef.current) { setConflictOpen(true); return; }
    await writeToDisk(toText(s));
  };

  const fetchContent = async (token: string) => {
    const r = await fetch(`${editor.url}?token=${encodeURIComponent(token)}`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.text();
  };

  useEffect(() => {
    if (api.stateRef.current !== null) return;
    let cancelled = false;
    const token = new URLSearchParams(location.search).get('token') ?? '';
    const load = async () => {
      try {
        const text = await fetchContent(token);
        if (!cancelled) { api.load(text, editor.line === undefined ? undefined : editor.line - 1); setLastSaved(text); }
      } catch {
        if (!cancelled) setLoadError(`Failed to load ${editor.name}`);
      }
    };
    void load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor.url, editor.name]);

  const dirty = useMemo(() => state !== null && lastSaved !== null && toText(state) !== lastSaved, [state, lastSaved]);

  // Live-reload from disk when another process changes the file, as long as the user hasn't
  // touched the buffer yet; otherwise remember the conflict for the next save attempt.
  const dirtyForWatchRef = useRef(dirty);
  dirtyForWatchRef.current = dirty;
  const seenMtimeRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (editor.mtimeMs === undefined || editor.mtimeMs === seenMtimeRef.current) return;
    const isFirstSighting = seenMtimeRef.current === undefined;
    seenMtimeRef.current = editor.mtimeMs;
    if (isFirstSighting) return;
    if (dirtyForWatchRef.current) { conflictPendingRef.current = true; return; }
    const token = new URLSearchParams(location.search).get('token') ?? '';
    void (async () => {
      try {
        const text = await fetchContent(token);
        const line = api.stateRef.current?.cursor.line;
        api.load(text, line);
        setLastSaved(text);
      } catch {
        // The reload is best-effort — the buffer just keeps showing the last content we had.
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor.mtimeMs]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, state?.cursor.line, state?.cursor.col]);

  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const saveRef = useRef(save);
  saveRef.current = save;

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

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing) return;
    // Nothing typed in the editor may reach App's global bindings (Ctrl+T, Ctrl+R, Ctrl+arrows).
    e.stopPropagation();
    if (handleSuggestKeyDown(e, api, suggest)) return;
    const action = actionForKey(e);
    if (!action) return;
    e.preventDefault();
    api.apply(action, pageLines(), resolveVertical);
  };

  // Typed text and paste both arrive through the hidden textarea (keeps IME composition working).
  // While the agent query line is open, route the value into its text instead of the buffer — the
  // keydown path (handleSuggestKeyDown) covers ordinary typing, but paste and IME composition
  // bypass it entirely.
  const flushTextarea = () => {
    const textarea = textareaRef.current;
    if (!textarea || composingRef.current || !textarea.value) return;
    if (suggest.queryLine) suggest.setQueryLineState(insertText(suggest.queryLine.state, textarea.value));
    else api.insert(textarea.value);
    textarea.value = '';
  };

  const gutterCh = state ? String(state.lines.length).length + 1 : 2;
  const onMetaMouseUp = () => { if (!globalThis.getSelection()?.toString()) textareaRef.current?.focus(); };

  return (
    <div className="editor-tab" data-doc-shot="editor-view">
      <EditorMetaRow
        editor={editor} dirty={dirty} savedFlash={savedFlash} error={saveError ?? loadError}
        onSave={() => { void save(); }} onMouseUp={onMetaMouseUp} connectionsButton={connections.connectionsButton}
      />
      <PendingSuggestPanel pending={suggest.pending} />
      <div
        className="editor-body"
        ref={bodyRef}
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
      {conflictOpen && (
        <OverwriteConflictDialog
          onSave={() => {
            setConflictOpen(false);
            const s = api.stateRef.current;
            if (s) void writeToDisk(toText(s));
          }}
          onCancel={() => setConflictOpen(false)}
        />
      )}
    </div>
  );
});
