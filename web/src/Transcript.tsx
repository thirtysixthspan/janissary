import React, { useCallback, useEffect, useRef } from 'react';
import type { JanusClient } from './ws';
import type { BufferLine } from '@shared/protocol';
import { renderLine } from './transcript-line';

type Properties = {
  lines: BufferLine[];
  client: JanusClient;
  onToggleCollapse: () => void;
  scrollRef: React.RefObject<HTMLDivElement | null>;
};

export function Transcript({ lines, client, onToggleCollapse, scrollRef }: Properties) {
  const stick = useRef(true);
  const contentReference = useRef<HTMLDivElement>(null);

  const pin = useCallback(() => {
    const element = scrollRef.current;
    if (element && stick.current) element.scrollTop = element.scrollHeight;
  }, [scrollRef]);

  useEffect(() => { pin(); }, [lines, pin]);

  useEffect(() => {
    const content = contentReference.current;
    if (!content) return;
    const ro = new ResizeObserver(() => pin());
    ro.observe(content);
    return () => ro.disconnect();
  }, [pin]);

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
      {lines.map((line, index) => renderLine(line, index, client, onToggleCollapse))}
      </div>
    </div>
  );
}
