import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { EditorView } from '@shared/protocol';
import type { JanusClient } from './ws';
import { toText } from './editor/model';
import { EditorLine, lineSelection } from './editor/render';
import { actionForKey } from './editor/keys';
import { useEditor } from './editor/useEditor';
import { useEditorMouse } from './editor/useEditorMouse';

// The plain-text editor tab. Mounted persistently by App (like harness tabs) so the buffer, undo
// stacks, cursor, and scroll position survive tab switches; `active` gates focus and the caret.
export function EditorTab({ editor, client, active }: { editor: EditorView; client: JanusClient; active: boolean }) {
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const caretRef = useRef<HTMLSpanElement>(null);
  const composingRef = useRef(false);

  const api = useEditor(() => { void save(); });
  const { state } = api;
  const mouse = useEditorMouse(api, bodyRef, () => textareaRef.current?.focus());

  const save = async () => {
    const s = api.stateRef.current;
    if (!s) return;
    const text = toText(s);
    setSaveError(null);
    const error = await client.saveFile(editor.url, text);
    if (error) { setSaveError(error); return; }
    setLastSaved(text);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1500);
  };

  useEffect(() => {
    let cancelled = false;
    const token = new URLSearchParams(location.search).get('token') ?? '';
    const load = async () => {
      try {
        const r = await fetch(`${editor.url}?token=${encodeURIComponent(token)}`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const text = await r.text();
        if (!cancelled) { api.load(text); setLastSaved(text); }
      } catch {
        if (!cancelled) setLoadError(`Failed to load ${editor.name}`);
      }
    };
    void load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor.url, editor.name]);

  const loaded = state !== null;
  useEffect(() => { if (active && loaded) textareaRef.current?.focus(); }, [active, loaded]);
  useEffect(() => { if (active) caretRef.current?.scrollIntoView({ block: 'nearest' }); }, [active, state?.cursor.line, state?.cursor.col]);

  const dirty = useMemo(() => state !== null && lastSaved !== null && toText(state) !== lastSaved, [state, lastSaved]);

  // A viewport's worth of logical lines for PageUp/PageDown, from the measured row line-height.
  const pageLines = () => {
    const body = bodyRef.current;
    if (!body) return 20;
    const lineHeight = Number(getComputedStyle(body).lineHeight.replace('px', '')) || 18;
    return Math.max(1, Math.floor(body.clientHeight / lineHeight) - 1);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing) return;
    // Nothing typed in the editor may reach App's global bindings (Ctrl+T, Ctrl+R, Ctrl+arrows).
    e.stopPropagation();
    const action = actionForKey(e);
    if (!action) return;
    e.preventDefault();
    api.apply(action, pageLines());
  };

  // Typed text and paste both arrive through the hidden textarea (keeps IME composition working).
  const flushTextarea = () => {
    const textarea = textareaRef.current;
    if (!textarea || composingRef.current) return;
    if (textarea.value) { api.insert(textarea.value); textarea.value = ''; }
  };

  const gutterCh = state ? String(state.lines.length).length + 1 : 2;

  return (
    <div className="image-tab editor-tab">
      <div className="image-meta">
        <span className="image-name">{editor.name}{dirty ? ' ●' : ''}</span>
        <span className="image-size">{editor.size}</span>
        <span className="image-loc">{editor.path}</span>
        {savedFlash && <span className="editor-saved">Saved</span>}
        {(saveError ?? loadError) && <span className="editor-error">{saveError ?? loadError}</span>}
      </div>
      <div className="editor-body" ref={bodyRef} onMouseDown={mouse.onMouseDown}>
        <textarea
          ref={textareaRef}
          className="editor-textarea"
          aria-label={`Edit ${editor.name}`}
          onKeyDown={onKeyDown}
          onInput={flushTextarea}
          onCompositionStart={() => { composingRef.current = true; }}
          onCompositionEnd={() => { composingRef.current = false; flushTextarea(); }}
        />
        {state?.lines.map((text, index) => {
          const [selFrom, selTo] = lineSelection(state, index);
          const onCursorLine = index === state.cursor.line;
          return (
            <EditorLine
              key={index}
              text={text}
              line={index}
              gutterCh={gutterCh}
              isCurrent={onCursorLine}
              selFrom={selFrom}
              selTo={selTo}
              caretCol={onCursorLine && active ? state.cursor.col : -1}
              caretRef={onCursorLine ? caretRef : null}
            />
          );
        })}
      </div>
    </div>
  );
}
