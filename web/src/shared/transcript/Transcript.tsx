import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import type { JanusClient } from '../../ws';
import type { BufferLine } from '@shared/protocol';
import { renderLine, type LineHighlight } from './transcript-line';
import { transcriptIntents } from './transcript-intents';
import { TerminalCard } from './TerminalCard';

type Properties = {
  lines: BufferLine[];
  client: JanusClient;
  onToggleCollapse: () => void;
  onPromptClick: (text: string) => void;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  // The current search match, if any — disables stick-to-bottom pinning and scrolls the
  // matched line into view instead (see the effect below).
  highlight?: LineHighlight;
  // Whether to show the "Type help..." hint when there are no lines yet. Defaults to true
  // for interactive agent tabs; read-only feeds (e.g. notifications) pass false.
  showEmptyHint?: boolean;
  // Whether new content auto-scrolls the view to the bottom. Defaults to true for
  // interactive agent tabs, where output is appended at the end; a newest-first feed
  // (e.g. notifications) passes false so it never fights the caller's own ordering.
  pinToBottom?: boolean;
};

export function Transcript({ lines, client, onToggleCollapse, onPromptClick, scrollRef, highlight, showEmptyHint = true, pinToBottom = true }: Properties) {
  const stick = useRef(true);
  // The scroll position auto-scroll has already accounted for. Scroll events are delivered
  // asynchronously, so the event a pin triggers can land after newer output has grown the content:
  // at that moment the viewport measures far from the bottom although the user never moved it.
  // Comparing against this value tells the two apart — only a position we did not write ourselves
  // counts as the user scrolling away.
  const lastTop = useRef(0);
  const contentReference = useRef<HTMLDivElement>(null);

  // Memoized because the markdown line's click handler feeds a useCallback dependency array — a
  // fresh intents object each render would rebuild that callback for every line.
  const intents = useMemo(() => transcriptIntents(client), [client]);

  const pin = useCallback(() => {
    if (!pinToBottom) return;
    const element = scrollRef.current;
    if (!element || !stick.current || highlight) return;
    element.scrollTop = element.scrollHeight;
    lastTop.current = element.scrollTop;
  }, [scrollRef, highlight, pinToBottom]);

  useEffect(() => { pin(); }, [lines, pin]);

  useEffect(() => {
    const content = contentReference.current;
    if (!content) return;
    const ro = new ResizeObserver(() => pin());
    ro.observe(content);
    return () => ro.disconnect();
  }, [pin]);

  // Scroll the highlighted line near the bottom of the viewport (~2 line-heights of context
  // below it), instead of the usual stick-to-bottom pinning.
  useEffect(() => {
    if (!highlight) return;
    const element = scrollRef.current;
    const hitElement = element?.querySelector('[data-search-hit]');
    if (!element || !hitElement) return;
    const target = (hitElement as HTMLElement).offsetTop - element.clientHeight + 2 * 22;
    element.scrollTop = Math.max(0, target);
  }, [highlight, lines, scrollRef]);

  const onScroll = () => {
    const element = scrollRef.current;
    if (!element || Math.abs(element.scrollTop - lastTop.current) < 1) return;
    lastTop.current = element.scrollTop;
    stick.current = element.scrollHeight - element.scrollTop - element.clientHeight < 40;
  };

  return (
    <div className="transcript" data-doc-shot="transcript" ref={scrollRef} onScroll={onScroll}>
      <div ref={contentReference}>
      {showEmptyHint && lines.length === 0 && (
        <div className="line empty-state">Type "help" for available commands.</div>
      )}
      {lines.map((line, index) => (line.type === 'terminal' && line.terminal
        ? <TerminalCard key={line.terminal.ptyId} entry={line.terminal} client={client} />
        : renderLine(line, index, intents, onToggleCollapse, onPromptClick, highlight)))}
      </div>
    </div>
  );
}
