import React, { useCallback, useMemo } from 'react';
import type { JanusClient } from './ws';
import type { BufferLine } from '@shared/protocol';
import { matchRange } from '@shared/search-matches';
import { TerminalCard } from './TerminalCard';
import { renderMarkdown } from './markdown';
import { fileLineSegments, linkifyMarkdown, renderFileLinkSegments } from './file-link';

const FILE_LINE_LINK = /[\\/][^:]*:\d+$/;

// The current search match's line index and pattern, for substring highlighting. `null`/`undefined`
// when search mode is closed or no match is current.
export type LineHighlight = { lineIndex: number; pattern: string } | null;

// Wrap the first match of `pattern` in `text` with a `search-hit` span, or return the text
// unchanged when there's no match (or highlighting isn't active for this line).
function highlightText(text: string, highlight: LineHighlight | undefined, index: number): React.ReactNode {
  if (!highlight || highlight.lineIndex !== index) return text;
  const range = matchRange(text, highlight.pattern);
  if (!range) return text;
  return (
    <>
      {text.slice(0, range.start)}
      <span className="search-hit">{text.slice(range.start, range.end)}</span>
      {text.slice(range.end)}
    </>
  );
}

// Markdown renders sanitized HTML via dangerouslySetInnerHTML, so a matched substring can't be
// safely wrapped inline — the whole block gets the search-hit class as a fallback instead.
function Markdown({ text, hit, onLinkClick }: { text: string; hit: boolean; onLinkClick: (url: string) => void }) {
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
  if (html === undefined) return <div className={`line output${hit ? ' search-hit' : ''}`}>{text}</div>;
  return (
    <div
      className={`line markdown${hit ? ' search-hit' : ''}`}
      dangerouslySetInnerHTML={{ __html: html }}
      onClick={onClick}
      {...(hit ? { 'data-search-hit': true } : {})}
    />
  );
}

export function renderLine(
  line: BufferLine,
  index: number,
  client: JanusClient,
  onToggleCollapse: () => void,
  onPromptClick: (text: string) => void,
  highlight?: LineHighlight,
) {
  if (line.type === 'terminal' && line.terminal) {
    return <TerminalCard key={line.terminal.ptyId} entry={line.terminal} client={client} />;
  }
  if (line.type === 'spacer') return <div key={index} className="line spacer" />;

  const hit = !!highlight && highlight.lineIndex === index;

  if (line.type === 'markdown') return <Markdown key={index} text={line.text} hit={hit} onLinkClick={(url) => {
      const isFile = FILE_LINE_LINK.test(url);
      const colon = isFile ? url.lastIndexOf(':') : -1;
      const path = colon > -1 ? url.slice(0, colon) : url;
      const cmd = isFile ? 'edit' : 'open';
      client.send({ method: 'command', params: { text: `${cmd} ${path}` } });
    }} />;

  const hitProps = hit ? { 'data-search-hit': true } : {};

  if (line.type === 'collapsed') {
    return (
      <div key={index} className="line collapsed" onClick={onToggleCollapse} title="Click or Ctrl+T to expand" {...hitProps}>
        ▸ {highlightText(line.text, highlight, index)} (click to expand)
      </div>
    );
  }
  if (line.type === 'prompt') {
    if (line.acp) {
      return (
        <div key={index} className="line prompt acp" onClick={onToggleCollapse} title="Click or Ctrl+T to collapse" {...hitProps}>
          + {highlightText(line.text, highlight, index)}
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
        {...hitProps}
      >
        {line.cwd && <span className="cwd">{line.cwd}</span>}
        <span>{'❯'} {highlightText(line.text, highlight, index)}</span>
      </div>
    );
  }
  if (line.type === 'message') {
    return (
      <div key={index} className="line message" style={{ color: line.fromColor }} {...hitProps}>
        ● {line.from}{line.text ? `: ${highlightText(line.text, highlight, index)}` : ''}
      </div>
    );
  }
  if (line.running) {
    return <div key={index} className="line output running" {...hitProps}>{highlightText(line.text, highlight, index)}</div>;
  }
  if (line.acp) {
    return (
      <div key={index} className="line output acp" onClick={onToggleCollapse} title="Click or Ctrl+T to collapse" {...hitProps}>
        {line.text ? highlightText(line.text, highlight, index) : ' '}
      </div>
    );
  }
  return (
    <div key={index} className="line output" style={line.fromColor ? { color: line.fromColor } : undefined} {...hitProps}>
      {hit ? highlightText(line.text, highlight, index) : renderFileLinkSegments(fileLineSegments(line.text), client)}
    </div>
  );
}
