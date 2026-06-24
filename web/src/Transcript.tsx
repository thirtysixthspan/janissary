import React, { useEffect, useRef } from 'react';
import type { JanusClient } from './ws';
import type { BufferLine } from './protocol';
import { TerminalCard } from './TerminalCard';

type Props = {
  lines: BufferLine[];
  client: JanusClient;
  onToggleCollapse: () => void;
  // The scroll container, owned by App so keyboard navigation can scroll it.
  scrollRef: React.RefObject<HTMLDivElement | null>;
};

export function Transcript({ lines, client, onToggleCollapse, scrollRef }: Props) {
  // Stick to the bottom as new output arrives, unless the user has scrolled up (spec: auto-scroll
  // on output; Escape / scroll-down return to the bottom).
  const stick = useRef(true);
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [lines, scrollRef]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  };

  return (
    <div className="transcript" ref={scrollRef} onScroll={onScroll}>
      {lines.length === 0 && (
        <div className="line empty-state">Type "help" for available commands.</div>
      )}
      {lines.map((line, i) => {
        if (line.type === 'terminal' && line.terminal) {
          return <TerminalCard key={line.terminal.ptyId} entry={line.terminal} client={client} />;
        }
        if (line.type === 'spacer') return <div key={i} className="line spacer" />;
        // Collapsed run of agent tool steps — click (or Ctrl+T) to expand.
        if (line.type === 'collapsed') {
          return (
            <div key={i} className="line collapsed" onClick={onToggleCollapse} title="Click or Ctrl+T to expand">
              ▸ {line.text} (click to expand)
            </div>
          );
        }
        if (line.type === 'prompt') {
          // Expanded agent tool steps (acp) render as `+ <command>`; click to re-collapse.
          if (line.acp) {
            return (
              <div key={i} className="line prompt acp" onClick={onToggleCollapse} title="Click or Ctrl+T to collapse">
                + {line.text}
              </div>
            );
          }
          return (
            <div key={i} className="line prompt">
              {line.cwd && <span className="cwd">{line.cwd}</span>}
              <span>{'❯'} {line.text}</span>
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
        // A shell command still running (no output yet): yellow Running... indicator.
        if (line.running) {
          return <div key={i} className="line output running">{line.text}</div>;
        }
        // An agent tool-step result (acp) is indented, dimmed, and click-to-collapse.
        if (line.acp) {
          return (
            <div key={i} className="line output acp" onClick={onToggleCollapse} title="Click or Ctrl+T to collapse">
              {line.text || ' '}
            </div>
          );
        }
        return (
          <div key={i} className="line output" style={line.fromColor ? { color: line.fromColor } : undefined}>
            {line.text || ' '}
          </div>
        );
      })}
    </div>
  );
}
