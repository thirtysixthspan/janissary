import React, { useEffect, useRef } from 'react';
import type { JanusClient } from './ws';
import type { BufferLine } from './protocol';
import { TerminalCard } from './TerminalCard';

type Props = { lines: BufferLine[]; client: JanusClient; onToggleCollapse: () => void };

export function Transcript({ lines, client, onToggleCollapse }: Props) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [lines]);

  return (
    <div className="transcript">
      {lines.map((line, i) => {
        if (line.type === 'terminal' && line.terminal) {
          return <TerminalCard key={line.terminal.ptyId} entry={line.terminal} client={client} />;
        }
        if (line.type === 'spacer') return <div key={i} className="line spacer" />;
        if (line.type === 'collapsed') {
          return <div key={i} className="line collapsed" onClick={onToggleCollapse}>⋯ {line.text} (click to expand)</div>;
        }
        if (line.type === 'prompt') {
          return (
            <div key={i} className="line prompt">
              {line.cwd && <span className="cwd">{line.cwd}</span>}
              <span>❯ {line.text}</span>
            </div>
          );
        }
        if (line.type === 'message') {
          return (
            <div key={i} className="line message" style={{ color: line.fromColor }}>
              ● {line.from}{line.text ? `: ${line.text}` : ''}
            </div>
          );
        }
        return (
          <div key={i} className="line output" style={line.fromColor ? { color: line.fromColor } : undefined}>
            {line.text || ' '}
          </div>
        );
      })}
      <div ref={endRef} />
    </div>
  );
}
