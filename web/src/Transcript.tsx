import React, { useCallback, useEffect, useRef } from 'react';
import type { JanusClient } from './ws';
import type { BufferLine } from '@shared/protocol';
import { renderLine, type LineHighlight } from './transcript-line';

type Properties = {
  lines: BufferLine[];
  client: JanusClient;
  onToggleCollapse: () => void;
  onPromptClick: (text: string) => void;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  // The current search match, if any — disables stick-to-bottom pinning and scrolls the
  // matched line into view instead (see the effect below).
  highlight?: LineHighlight;
};

export function Transcript({ lines, client, onToggleCollapse, onPromptClick, scrollRef, highlight }: Properties) {
  const stick = useRef(true);
  const contentReference = useRef<HTMLDivElement>(null);

  const pin = useCallback(() => {
    const element = scrollRef.current;
    if (element && stick.current && !highlight) element.scrollTop = element.scrollHeight;
  }, [scrollRef, highlight]);

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
    if (element) stick.current = element.scrollHeight - element.scrollTop - element.clientHeight < 40;
  };

  return (
    <div className="transcript" ref={scrollRef} onScroll={onScroll}>
      <div ref={contentReference}>
      {lines.length === 0 && (
        <div className="line empty-state">Type "help" for available commands.</div>
      )}
      {lines.map((line, index) => renderLine(line, index, client, onToggleCollapse, onPromptClick, highlight))}
      </div>
    </div>
  );
}
