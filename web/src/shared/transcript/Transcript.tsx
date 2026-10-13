import React from 'react';
import type { BufferLine } from '@shared/protocol';
import { renderLine } from './transcript-line';
import type { LineHighlight } from './line-text';
import { useTranscriptPin } from './useTranscriptPin';
import { TerminalCard } from './TerminalCard';
import type { TranscriptIntents } from './transcript-intents';
import type { PtyActions } from '../terminal/pty-actions';

type Properties = {
  lines: BufferLine[];
  intents: TranscriptIntents;
  ptyActions: PtyActions;
  onToggleCollapse: () => void;
  onPromptClick: (text: string) => void;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  // The current search match, if any — disables stick-to-bottom pinning and scrolls the
  // matched line into view instead (see the effect below).
  highlight?: LineHighlight;
  // Whether to show the "Type help..." hint when there are no lines yet. Defaults to true
  // for interactive tabs; read-only feeds (e.g. notifications) pass false.
  showEmptyHint?: boolean;
  // Whether new content auto-scrolls the view to the bottom. Defaults to true for
  // interactive tabs, where output is appended at the end; a newest-first feed
  // (e.g. notifications) passes false so it never fights the caller's own ordering.
  pinToBottom?: boolean;
};

export function Transcript({ lines, intents, ptyActions, onToggleCollapse, onPromptClick, scrollRef, highlight, showEmptyHint = true, pinToBottom = true }: Properties) {
  const { contentRef, onScroll } = useTranscriptPin({ lines, highlight, pinToBottom, scrollRef });

  return (
    <div className="transcript" data-doc-shot="transcript" ref={scrollRef} onScroll={onScroll}>
      <div ref={contentRef}>
      {showEmptyHint && lines.length === 0 && (
        <div className="line empty-state">Type "help" for available commands.</div>
      )}
      {lines.map((line, index) => (line.type === 'terminal' && line.terminal
        ? <TerminalCard key={line.terminal.ptyId} entry={line.terminal} actions={ptyActions} />
        : renderLine(line, index, intents, onToggleCollapse, onPromptClick, highlight)))}
      </div>
    </div>
  );
}
