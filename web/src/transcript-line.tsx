import React, { useCallback, useMemo } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { JanusClient } from './ws';
import { viewCaptureIcon, promptIcon, collapsedIcon } from './icons';
import type { BufferLine } from '@shared/protocol';
import { matchRange } from '@shared/search-matches';
import { TerminalCard } from './TerminalCard';
import { renderMarkdown } from './markdown';
import { fileLineSegments, linkifyMarkdown, renderFileLinkSegments } from './file-link';
import { hasAnsiCodes, parseAnsi } from './ansi';

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

// Renders ANSI-styled segments; when `client` is given, each segment's text is additionally run
// through file-link detection (composes cleanly since segments are already escape-code-free).
function renderAnsiSegments(text: string, client?: JanusClient): React.ReactNode[] {
  return parseAnsi(text).map((seg, i) => {
    const content: React.ReactNode = client ? renderFileLinkSegments(fileLineSegments(seg.text), client) : seg.text;
    if (seg.className) return <span key={i} className={seg.className}>{content}</span>;
    return client ? <React.Fragment key={i}>{content}</React.Fragment> : content;
  });
}

// Shared by the `running` and `acp` branches (neither does file-link detection): the current
// search hit still wins, then ANSI styling, then plain highlighted text as before.
function renderOutputText(text: string, highlight: LineHighlight | undefined, index: number): React.ReactNode {
  if (highlight && highlight.lineIndex === index) return highlightText(text, highlight, index);
  if (hasAnsiCodes(text)) return renderAnsiSegments(text);
  return highlightText(text, highlight, index);
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

function renderTextContent(
  text: string,
  highlight: LineHighlight | undefined,
  index: number,
  hit: boolean,
  client: JanusClient,
): React.ReactNode {
  if (hit) return highlightText(text, highlight, index);
  if (hasAnsiCodes(text)) return renderAnsiSegments(text, client);
  return renderFileLinkSegments(fileLineSegments(text), client);
}

function hitForLine(highlight: LineHighlight | undefined, index: number): { hit: boolean; props: Record<string, unknown> } {
  const hit = !!highlight && highlight.lineIndex === index;
  return { hit, props: hit ? { 'data-search-hit': true } : {} };
}

// A clickable "view capture" affordance on a notification line: opens the captured file in an
// editor tab by sending the existing `edit <path>` command, mirroring the file-link click path.
function OpenFileLink({ path, client }: { path: string; client: JanusClient }) {
  return (
    <span
      className="file-link"
      role="link"
      aria-label="View capture"
      title="Open the captured screen in an editor tab"
      onClick={() => client.send({ method: 'command', params: { text: `edit ${path}` } })}
    >
      {' '}<FontAwesomeIcon icon={viewCaptureIcon} />
    </span>
  );
}

function renderMarkdownLine(
  line: { text: string },
  index: number,
  hit: boolean,
  client: JanusClient,
): React.ReactNode {
  return <Markdown key={index} text={line.text} hit={hit} onLinkClick={(url) => {
    const cmd = FILE_LINE_LINK.test(url) ? 'edit' : 'open';
    client.send({ method: 'command', params: { text: `${cmd} ${url}` } });
  }} />;
}

function renderPromptLine(
  line: { acp?: boolean; cwd?: string; text: string },
  index: number,
  highlight: LineHighlight | undefined,
  onToggleCollapse: () => void,
  onPromptClick: (text: string) => void,
  hit: boolean,
  hitProps: Record<string, unknown>,
): React.ReactNode {
  if (line.acp) {
    return (
      <div key={index} className="line prompt acp" onClick={onToggleCollapse} title="Click or Ctrl+T to collapse" {...hitProps}>
        + {highlightText(line.text, highlight, index)}
      </div>
    );
  }
  return (
    <div key={index} className="line prompt" {...hitProps}>
      {line.cwd && <span className="cwd">{line.cwd}</span>}
      <span
        className="prompt-text"
        title="Double-click to execute this command"
        onMouseDown={(e) => { if (e.detail > 1) e.preventDefault(); }}
        onDoubleClick={() => {
          const selection = globalThis.getSelection()?.toString();
          if (selection) return;
          onPromptClick(line.text);
        }}
      >
        <FontAwesomeIcon icon={promptIcon} /> {highlightText(line.text, highlight, index)}
      </span>
    </div>
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

  const { hit, props: hitProps } = hitForLine(highlight, index);

  if (line.type === 'markdown') return renderMarkdownLine(line, index, hit, client);

  if (line.type === 'collapsed') {
    return (
      <div key={index} className="line collapsed" onClick={onToggleCollapse} title="Click or Ctrl+T to expand" {...hitProps}>
        <FontAwesomeIcon icon={collapsedIcon} /> {highlightText(line.text, highlight, index)} (click to expand)
      </div>
    );
  }
  if (line.type === 'prompt') {
    return renderPromptLine(line, index, highlight, onToggleCollapse, onPromptClick, hit, hitProps);
  }
  if (line.type === 'message') {
    const [time, ...tabParts] = (line.from ?? '').split(' ');
    const tab = tabParts.join(' ');
    return (
      <div
        key={index}
        className="line message"
        style={line.fromColor ? { '--from-color': line.fromColor } as React.CSSProperties : undefined}
        {...hitProps}
      >
        <span className="message-time">{time}</span>
        {tab && <span className="message-tab">{tab}</span>}
        {line.text && <span className="message-text">{highlightText(line.text, highlight, index)}</span>}
        {line.openFile && <OpenFileLink path={line.openFile} client={client} />}
      </div>
    );
  }
  if (line.running) {
    return <div key={index} className="line output running" {...hitProps}>{renderOutputText(line.text, highlight, index)}</div>;
  }
  if (line.acp) {
    return (
      <div key={index} className="line output acp" onClick={onToggleCollapse} title="Click or Ctrl+T to collapse" {...hitProps}>
        {line.text ? renderOutputText(line.text, highlight, index) : ' '}
      </div>
    );
  }
  return (
    <div key={index} className="line output" style={line.fromColor ? { color: line.fromColor } : undefined} {...hitProps}>
      {renderTextContent(line.text, highlight, index, hit, client)}
    </div>
  );
}
