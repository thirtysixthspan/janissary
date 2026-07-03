import React, { useCallback, useMemo } from 'react';
import type { JanusClient } from './ws';
import type { BufferLine } from '@shared/protocol';
import { TerminalCard } from './TerminalCard';
import { renderMarkdown } from './markdown';
import { fileLineSegments, linkifyMarkdown, renderFileLinkSegments } from './file-link';

const FILE_LINE_LINK = /[\\/][^:]*:\d+$/;

function Markdown({ text, onLinkClick }: { text: string; onLinkClick: (url: string) => void }) {
  const linkedText = useMemo(() => linkifyMarkdown(text), [text]);
  const html = useMemo(() => renderMarkdown(linkedText), [linkedText]);
  const onClick = useCallback((e: React.MouseEvent) => {
    const anchor = (e.target as HTMLElement).closest('a');
    if (!anchor) return;
    const href = anchor.getAttribute('href');
    if (!href) return;
    if (/^https?:\/\//i.test(href)) { e.preventDefault(); onLinkClick(href); return; }
    if (FILE_LINE_LINK.test(href)) { e.preventDefault(); onLinkClick(href); }
  }, [onLinkClick]);
  if (html === undefined) return <div className="line output">{text}</div>;
  return <div className="line markdown" dangerouslySetInnerHTML={{ __html: html }} onClick={onClick} />;
}

export function renderLine(
  line: BufferLine,
  index: number,
  client: JanusClient,
  onToggleCollapse: () => void,
  onPromptClick: (text: string) => void,
) {
  if (line.type === 'terminal' && line.terminal) {
    return <TerminalCard key={line.terminal.ptyId} entry={line.terminal} client={client} />;
  }
  if (line.type === 'spacer') return <div key={index} className="line spacer" />;
  if (line.type === 'markdown') return <Markdown key={index} text={line.text} onLinkClick={(url) => {
      const colon = FILE_LINE_LINK.test(url) ? url.lastIndexOf(':') : -1;
      const path = colon > -1 ? url.slice(0, colon) : url;
      client.send({ method: 'command', params: { text: `open ${path}` } });
    }} />;
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
      <div
        key={index}
        className="line prompt"
        title="Click to execute this command"
        onClick={() => {
          const selection = globalThis.getSelection()?.toString();
          if (selection) return;
          onPromptClick(line.text);
        }}
      >
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
      {renderFileLinkSegments(fileLineSegments(line.text), client)}
    </div>
  );
}
