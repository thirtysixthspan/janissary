import React from 'react';
import type { EditorState } from './model';
import { EditorLine, DiffAddedLine, lineSelection } from './render';
import type { EditorSuggestApi } from './useEditorSuggest';
import { suggestPillLabel } from './suggest-request';
import { suggestDiffPreview } from './suggestDiff';
import type { TokenRange } from './highlight/tokenize';

type EditorLinesProps = {
  state: EditorState;
  tokens: TokenRange[][];
  suggest: EditorSuggestApi;
  active: boolean;
  gutterCh: number;
  caretRef: React.Ref<HTMLSpanElement>;
};

// The buffer's rendered lines, one `EditorLine` each, including the in-editor persona-suggestion
// status pill for any `>`-led request line and, while a hunk is focused for accept/decline, an
// inline diff preview of that hunk in place of a separate change block. Split out of EditorTab.tsx
// to keep that file under the 200-line cap (mirroring Decision 12's extraction of
// PendingSuggestPanel and handleSuggestKeyDown).
export function EditorLines({ state, tokens, suggest, active, gutterCh, caretRef }: EditorLinesProps) {
  const pending = suggest.pending;
  const diff = pending ? suggestDiffPreview(state.lines, pending.hunks[pending.index]) : null;

  const renderLine = (text: string, index: number, removed: boolean) => {
    const [selFrom, selTo] = lineSelection(state, index);
    const onCursorLine = index === state.cursor.line;
    const pill = suggestPillLabel(
      text,
      suggest.personas,
      suggest.firingLine,
      pending?.requestLineText ?? null,
      suggest.noSuggestionLine,
    );
    const pillFocused = onCursorLine && suggest.focusedPillLine === index;
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
        tokens={tokens[index] ?? []}
        pill={pill}
        pillFocused={pillFocused}
        removed={removed}
      />
    );
  };

  if (!diff) return <>{state.lines.map((text, index) => renderLine(text, index, false))}</>;

  const removedEnd = diff.startLine + diff.removedCount;
  const before = state.lines.slice(0, diff.startLine).map((text, i) => renderLine(text, i, false));
  const removedLines = state.lines.slice(diff.startLine, removedEnd).map((text, i) => renderLine(text, diff.startLine + i, true));
  const addedLines = diff.added.map((text, i) => <DiffAddedLine key={`added-${i}`} text={text} gutterCh={gutterCh} />);
  const after = state.lines.slice(removedEnd).map((text, i) => renderLine(text, removedEnd + i, false));

  return <>{[...before, ...removedLines, ...addedLines, ...after]}</>;
}
