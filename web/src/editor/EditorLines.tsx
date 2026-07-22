import React from 'react';
import type { EditorState } from './model';
import { EditorLine, lineSelection } from './render';
import type { EditorSuggestApi } from './useEditorSuggest';
import { suggestPillLabel } from './suggest-request';
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
// status pill for any `>`-led request line. Split out of EditorTab.tsx to keep that file under the
// 200-line cap (mirroring Decision 12's extraction of PendingSuggestPanel and handleSuggestKeyDown).
export function EditorLines({ state, tokens, suggest, active, gutterCh, caretRef }: EditorLinesProps) {
  return (
    <>
      {state.lines.map((text, index) => {
        const [selFrom, selTo] = lineSelection(state, index);
        const onCursorLine = index === state.cursor.line;
        const pill = suggestPillLabel(
          text,
          suggest.personas,
          suggest.firingLine,
          suggest.pending?.requestLineText ?? null,
          suggest.noSuggestionLine,
        );
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
          />
        );
      })}
    </>
  );
}
