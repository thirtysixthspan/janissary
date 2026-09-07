import { useRef, type RefObject } from 'react';
import type React from 'react';
import { actionForKey, yieldsToPlugins, type KeyLike } from './keys';
import { collapseSelection, hasMultipleSelections, insertText } from './model';
import { visualVerticalHit } from './mouse';
import { revealVerticalProbe } from './scroll';
import type { EditorApi, ResolveVertical } from './useEditor';
import type { EditorFindApi } from './useEditorFind';
import type { EditorSuggestApi } from './useEditorSuggest';
import { handleSuggestKeyDown } from './handleSuggestKeyDown';

type InteractionRefs = {
  bodyRef: RefObject<HTMLDivElement | null>;
  caretRef: RefObject<HTMLSpanElement | null>;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
};

type InteractionApis = {
  api: EditorApi;
  find: EditorFindApi;
  suggest: EditorSuggestApi;
  pluginKey: (event: KeyLike) => boolean;
};

type EditorInteractions = {
  onKeyDown: (event: React.KeyboardEvent) => void;
  onPaste: (event: React.ClipboardEvent) => void;
  flushTextarea: () => void;
  startComposition: () => void;
  endComposition: () => void;
  selectFindResult: (row: number) => void;
};

function viewportPageLines(height: number, lineHeight: number): number {
  return Math.max(1, Math.floor(height / lineHeight) - 1);
}

function pageLines(body: HTMLDivElement | null): number {
  if (!body) return 20;
  const lineHeight = Number(getComputedStyle(body).lineHeight.replace('px', '')) || 18;
  return viewportPageLines(body.clientHeight, lineHeight);
}

function verticalResolver(body: HTMLDivElement | null, caret: HTMLSpanElement | null): ResolveVertical {
  return (dir) => {
    if (!body || !caret) return null;
    revealVerticalProbe(body, caret, dir);
    const hit = visualVerticalHit(body, caret, dir);
    return hit ? { line: hit.line, col: hit.col } : null;
  };
}

export function useEditorInteractions({
  bodyRef, caretRef, textareaRef, api, suggest, find, pluginKey,
}: InteractionRefs & InteractionApis): EditorInteractions {
  const composingRef = useRef(false);
  const measuredPageLines = () => pageLines(bodyRef.current);

  const selectFindResult = (row: number) => {
    find.setSelected(row);
    const result = find.results[row];
    const current = api.stateRef.current;
    if (!result || !current) return;
    api.sealUndo();
    api.setState({ ...current, cursor: { line: result.index, col: 0 }, anchor: null });
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.nativeEvent.isComposing) return;
    event.stopPropagation();
    if (handleSuggestKeyDown(event, api, suggest, measuredPageLines())) return;

    const state = api.state;
    const context = {
      selectionSpansLines: state !== null && state.anchor !== null && state.anchor.line !== state.cursor.line,
      multipleSelections: state !== null && hasMultipleSelections(state),
    };
    if (yieldsToPlugins(event, context) && pluginKey(event)) { event.preventDefault(); return; }

    const action = actionForKey(event);
    if (!action) {
      if (pluginKey(event)) event.preventDefault();
      return;
    }
    event.preventDefault();
    if (action.kind === 'find') {
      if (state && hasMultipleSelections(state)) {
        api.sealUndo();
        api.setState(collapseSelection(state));
      }
      find.open();
      return;
    }
    api.apply(action, measuredPageLines(), verticalResolver(bodyRef.current, caretRef.current));
  };

  // The clipboard is taken straight off the event and the default is always cancelled, so a paste
  // never passes through the hidden textarea: a large one written there and read back is a round
  // trip through a control the user cannot see, and the browser may scroll the body to its caret
  // on the way. Non-text clipboard content simply yields nothing to insert.
  const onPaste = (event: React.ClipboardEvent) => {
    const text = event.clipboardData?.getData('text/plain') ?? '';
    event.preventDefault();
    if (!text) return;
    if (suggest.queryLine && suggest.focusTarget === 'query') {
      suggest.setQueryLineState(insertText(suggest.queryLine.state, text));
      return;
    }
    api.paste(text);
  };

  const flushTextarea = () => {
    const textarea = textareaRef.current;
    if (!textarea || composingRef.current || !textarea.value) return;
    if (suggest.queryLine && suggest.focusTarget === 'query') {
      suggest.setQueryLineState(insertText(suggest.queryLine.state, textarea.value));
    } else api.insert(textarea.value);
    textarea.value = '';
  };

  return {
    onKeyDown,
    onPaste,
    flushTextarea,
    startComposition: () => { composingRef.current = true; },
    endComposition: () => { composingRef.current = false; flushTextarea(); },
    selectFindResult,
  };
}
