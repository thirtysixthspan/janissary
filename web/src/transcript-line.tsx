import React, { useMemo } from 'react';
import type { JanusClient } from './ws';
import type { BufferLine } from '@shared/protocol';
import { TerminalCard } from './TerminalCard';
import { renderMarkdown } from './markdown';

function Markdown({ text }: { text: string }) {
  const html = useMemo(() => renderMarkdown(text), [text]);
  if (html === undefined) return <div className="line output">{text}</div>;
  return <div className="line markdown" dangerouslySetInnerHTML={{ __html: html }} />;
}

export function renderLine(
  line: BufferLine,
  index: number,
  client: JanusClient,
  onToggleCollapse: () => void,
) {
  if (line.type === 'terminal' && line.terminal) {
    return <TerminalCard key={line.terminal.ptyId} entry={line.terminal} client={client} />;
  }
  if (line.type === 'spacer') return <div key={index} className="line spacer" />;
  if (line.type === 'markdown') return <Markdown key={index} text={line.text} />;
  if (line.type === 'collapsed') {
    return (
      <div key={index} className="line collapsed" onClick={onToggleCollapse} title="Click or Ctrl+T to expand">
        ▸ {line.text} (click to expand)
      </div>
    );
  }
  if (line.type === 'prompt') {
    if (line.acp) {
      return (
        <div key={index} className="line prompt acp" onClick={onToggleCollapse} title="Click or Ctrl+T to collapse">
          + {line.text}
        </div>
      );
    }
    return (
      <div key={index} className="line prompt">
        {line.cwd && <span className="cwd">{line.cwd}</span>}
        <span>{'❯'} {line.text}</span>
      </div>
    );
  }
  if (line.type === 'message') {
    return (
      <div key={index} className="line message" style={{ color: line.fromColor }}>
        ● {line.from}{line.text ? `: ${line.text}` : ''}
      </div>
    );
  }
  if (line.running) {
    return <div key={index} className="line output running">{line.text}</div>;
  }
  if (line.acp) {
    return (
      <div key={index} className="line output acp" onClick={onToggleCollapse} title="Click or Ctrl+T to collapse">
        {line.text || ' '}
      </div>
    );
  }
  return (
    <div key={index} className="line output" style={line.fromColor ? { color: line.fromColor } : undefined}>
      {line.text || ' '}
    </div>
  );
}
