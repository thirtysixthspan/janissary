import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import type { JanusClient } from './ws';
import type { BufferLine } from '@shared/protocol';
import { TerminalCard } from './TerminalCard';

// An ACP agent reply rendered as Markdown. `marked` produces HTML (GFM tables/lists/code, single
// newlines as line breaks); DOMPurify strips any script/handler markup the model might emit before
// it is inserted. Falls back to plain text if parsing fails.
function Markdown({ text }: { text: string }) {
  const html = useMemo(() => {
    try {
      return DOMPurify.sanitize(marked.parse(text, { gfm: true, breaks: true, async: false }));
    } catch {
      // skip parsing on error
    }
  }, [text]);
  if (html === undefined) return <div className="line output">{text}</div>;
  return <div className="line markdown" dangerouslySetInnerHTML={{ __html: html }} />;
}

type Properties = {
  lines: BufferLine[];
  client: JanusClient;
  onToggleCollapse: () => void;
  // The scroll container, owned by App so keyboard navigation can scroll it.
  scrollRef: React.RefObject<HTMLDivElement | null>;
};

export function Transcript({ lines, client, onToggleCollapse, scrollRef }: Properties) {
  // Stick to the bottom as new output arrives, unless the user has scrolled up (spec: auto-scroll
  // on output; Escape / scroll-down return to the bottom).
  const stick = useRef(true);
  const contentReference = useRef<HTMLDivElement>(null);

  // Scroll to the very bottom, but only while "pinned" (the user hasn't scrolled up).
  const pin = useCallback(() => {
    const element = scrollRef.current;
    if (element && stick.current) element.scrollTop = element.scrollHeight;
  }, [scrollRef]);

  // Pin on every new render (new output).
  useEffect(() => { pin(); }, [lines, pin]);

  // A plain post-render scroll can fall short of the final bottom: the content reflows *after* the
  // scroll when long lines re-wrap (e.g. the vertical scrollbar appearing shrinks the width) or
  // other late layout. Re-pin whenever the content's size actually changes — the observer fires
  // after layout, so the view always lands at the true bottom while pinned.
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
      {lines.map((line, index) => {
        if (line.type === 'terminal' && line.terminal) {
          return <TerminalCard key={line.terminal.ptyId} entry={line.terminal} client={client} />;
        }
        if (line.type === 'spacer') return <div key={index} className="line spacer" />;
        if (line.type === 'markdown') return <Markdown key={index} text={line.text} />;
        // Collapsed run of agent tool steps — click (or Ctrl+T) to expand.
        if (line.type === 'collapsed') {
          return (
            <div key={index} className="line collapsed" onClick={onToggleCollapse} title="Click or Ctrl+T to expand">
              ▸ {line.text} (click to expand)
            </div>
          );
        }
        if (line.type === 'prompt') {
          // Expanded agent tool steps (acp) render as `+ <command>`; click to re-collapse.
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
        // A shell command still running (no output yet): yellow Running... indicator.
        if (line.running) {
          return <div key={index} className="line output running">{line.text}</div>;
        }
        // An agent tool-step result (acp) is indented, dimmed, and click-to-collapse.
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
      })}
      </div>
    </div>
  );
}
