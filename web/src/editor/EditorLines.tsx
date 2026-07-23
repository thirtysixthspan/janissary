import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { EditorState } from './model';
import { toText } from './model';
import { EditorLine, DiffAddedLine, lineSelection } from './render';
import type { EditorSuggestApi } from './useEditorSuggest';
import { suggestPillLabel } from './suggest-request';
import { suggestDiffPreview, type SuggestDiffPreview } from './suggestDiff';
import type { TokenRange } from './highlight/tokenize';
import { approveIcon, rejectIcon } from '../icons';

type EditorLinesProps = {
  state: EditorState;
  tokens: TokenRange[][];
  suggest: EditorSuggestApi;
  active: boolean;
  gutterCh: number;
  caretRef: React.Ref<HTMLSpanElement>;
};

// One unresolved hunk's diff preview, paired with its index into `pending.hunks` so accept/decline
// clicks can name the right hunk.
type HunkPreview = { index: number; diff: SuggestDiffPreview };

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
  const previews: HunkPreview[] = pending
    ? pending.hunks
      .map((hunk, index) => ({ index, diff: pending.resolved[index] ? null : suggestDiffPreview(state.lines, hunk) }))
      .filter((p): p is HunkPreview => p.diff !== null)
      .toSorted((a, b) => a.diff.startLine - b.diff.startLine)
    : [];

  const renderLine = (index: number, removed: boolean) => {
    const [selFrom, selTo] = lineSelection(state, index);
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

  if (previews.length === 0) return <>{state.lines.map((_, index) => renderRow(index, false))}</>;

  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  for (const { index: hunkIndex, diff } of previews) {
    // A hunk whose range starts before the previous one finished overlaps it — skip previewing it
    // this render pass rather than draw conflicting rows (Design decision: no interval-conflict UI).
    if (diff.startLine < cursor) continue;
    for (let i = cursor; i < diff.startLine; i++) nodes.push(renderRow(i, false));
    const removedEnd = diff.startLine + diff.removedCount;
    for (let i = diff.startLine; i < removedEnd; i++) nodes.push(renderRow(i, true));
    for (const [i, text] of diff.added.entries()) {
      const controls = i === diff.added.length - 1
        ? <HunkControls onAccept={() => suggest.acceptHunk(state, hunkIndex)} onDecline={() => suggest.declineHunk(state, hunkIndex)} />
        : undefined;
      nodes.push(<DiffAddedLine key={`added-${hunkIndex}-${i}`} text={text} gutterCh={gutterCh} controls={controls} />);
    }
    cursor = removedEnd;
  }
  for (let i = cursor; i < state.lines.length; i++) nodes.push(renderRow(i, false));

  return <>{nodes}</>;
}
