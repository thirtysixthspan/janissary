import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { EditorState } from './model';
import { toText } from './model';
import { EditorLine, DiffAddedLine, lineExtras, lineSelection } from './render';
import type { EditorSuggestApi } from './useEditorSuggest';
import { suggestPillLabel } from './suggest-request';
import { buildEditorRows } from './editor-rows';
import type { TokenRange } from './highlight/tokenize';
import { approveIcon, rejectIcon } from '../shared/icons';

type EditorLinesProps = {
  state: EditorState;
  tokens: TokenRange[][];
  suggest: EditorSuggestApi;
  active: boolean;
  gutterCh: number;
  caretRef: React.Ref<HTMLSpanElement>;
};

// The accept/decline icon pair rendered right-floated on a hunk's last added row, mirroring the
// monitor's suggestion rating buttons (`MonitorTab.tsx`).
function HunkControls({ onAccept, onDecline }: { onAccept: () => void; onDecline: () => void }) {
  return (
    <span className="editor-diff-controls">
      <button type="button" aria-label="Accept" title="Accept" onClick={onAccept}><FontAwesomeIcon icon={approveIcon} /></button>
      <button type="button" aria-label="Decline" title="Decline" onClick={onDecline}><FontAwesomeIcon icon={rejectIcon} /></button>
    </span>
  );
}

// The buffer's rendered lines, one `EditorLine` each, plus the ephemeral agent query line rendered
// inline at its anchor position in place of that (always-empty) buffer line, and, for every
// still-unresolved pending hunk, an inline diff preview of that hunk (all previewed at once) with
// its own accept/decline icons. Split out of EditorTab.tsx to keep that file under the 200-line cap
// (mirroring Decision 12's extraction of PendingSuggestPanel and handleSuggestKeyDown).
export function EditorLines({ state, tokens, suggest, active, gutterCh, caretRef }: EditorLinesProps) {
  const pending = suggest.pending;
  const queryLine = suggest.queryLine;
  const rows = buildEditorRows(state.lines, pending?.hunks ?? [], pending?.resolved ?? []);

  const renderLine = (index: number, removed: boolean) => {
    const [selFrom, selTo] = lineSelection(state, index);
    const extras = lineExtras(state, index);
    const onCursorLine = index === state.cursor.line;
    // A row after an open query line's anchor reads as if the anchor's line were not counted, so
    // the query renders as an insertion between two lines rather than a replacement of one.
    const gutterNumber = queryLine && index > queryLine.anchorLine ? index : index + 1;
    return (
      <EditorLine
        key={index}
        text={state.lines[index]}
        line={index}
        gutterCh={gutterCh}
        isCurrent={onCursorLine}
        selFrom={selFrom}
        selTo={selTo}
        caretCol={onCursorLine && active && suggest.focusTarget === 'buffer' ? state.cursor.col : -1}
        caretRef={onCursorLine ? caretRef : null}
        extraSpans={extras.spans}
        extraCarets={active && suggest.focusTarget === 'buffer' ? extras.carets : ''}
        tokens={tokens[index] ?? []}
        removed={removed}
        gutterNumber={gutterNumber}
      />
    );
  };

  // Renders the query line's own (possibly multi-line) state in place of its (always-empty) anchor
  // buffer line — one row per query line, each sharing the caret when it holds the cursor, and the
  // status pill on the last row, computed from the query's full text.
  const renderQueryRow = (anchorLine: number) => {
    const qs = queryLine!.state;
    const text = toText(qs);
    const pill = suggestPillLabel(text, suggest.personas, suggest.firingLine, pending ? text : null, suggest.noSuggestionLine);
    return qs.lines.map((lineText, i) => {
      const onCursorLine = qs.cursor.line === i;
      return (
        <EditorLine
          key={`query-${anchorLine}-${i}`}
          text={lineText}
          line={anchorLine}
          gutterCh={gutterCh}
          isCurrent
          selFrom={-1}
          selTo={-1}
          caretCol={onCursorLine && active && suggest.focusTarget === 'query' ? qs.cursor.col : -1}
          caretRef={onCursorLine ? caretRef : null}
          tokens={[]}
          pill={i === qs.lines.length - 1 ? pill : undefined}
          pillFocused={suggest.pillFocused}
          query
        />
      );
    });
  };

  const renderRow = (index: number, removed: boolean) => (queryLine && index === queryLine.anchorLine ? renderQueryRow(index) : renderLine(index, removed));

  return (
    <>
      {rows.map((row) => {
        if (row.kind === 'added') {
          const controls = row.last
            ? <HunkControls onAccept={() => suggest.acceptHunk(state, row.hunkIndex)} onDecline={() => suggest.declineHunk(state, row.hunkIndex)} />
            : undefined;
          return <DiffAddedLine key={`added-${row.hunkIndex}-${row.position}`} text={row.text} gutterCh={gutterCh} controls={controls} />;
        }
        return renderRow(row.index, row.kind === 'removed');
      })}
    </>
  );
}
