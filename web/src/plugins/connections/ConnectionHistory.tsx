import React from 'react';
import type { ConnectionWindow } from '@shared/plugins/connections/shared';
import { renderMarkdown } from '../api';
import { groupToolEntries, parseToolCalls, prettyJson } from './activity-text';
import { ToolCallBlock } from './ToolCallBlock';

export function ConnectionHistory({ window, openLink }: {
  window: ConnectionWindow | undefined;
  openLink?: (href: string) => void;
}) {
  if (!window) return <div className="connections-history-loading">Loading connection history…</div>;
  const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
    if (!anchor || !event.currentTarget.contains(anchor)) return;
    event.preventDefault();
    openLink?.(anchor.getAttribute('href') ?? '');
  };
  return (
    <div className="connections-history-content" onClick={handleClick}>
      {window.blocks.map((block, index) => (
        <article className="connections-block" key={window.offset + index}>
          <div className="connections-prompt">{block.prompt}</div>
          {block.preamble !== undefined && <Preamble preamble={block.preamble} />}
          {groupToolEntries(block.entries).map((row) => {
            if (row.kind === 'tool') {
              const parts = row.reply === undefined ? [row.command] : [row.command, row.reply];
              return (
                <details className="connections-activity" key={`${row.command.timestamp}:${row.index}`} open>
                  <summary>tool</summary>
                  {parts.map((part, partIndex) => (
                    <div className="connections-tool-part" key={partIndex}>
                      <div className="connections-tool-part-label">{partIndex === 0 ? 'command' : 'reply'}</div>
                      <ActivityText text={part.text} />
                    </div>
                  ))}
                </details>
              );
            }
            const entry = row.entry;
            const content = <ActivityText text={entry.text} />;
            return entry.kind === 'thought'
              ? <details className="connections-activity" key={`${entry.timestamp}:${row.index}`}>
                  <summary>thought</summary>{content}
                </details>
              : <div className="connections-activity" key={`${entry.timestamp}:${row.index}`}>
                  <div className="connections-activity-label">{entry.kind}</div>{content}
                </div>;
          })}
          {(block.replies ?? (block.answer === undefined ? [] : [block.answer])).map((answer, index) =>
            <Answer answer={answer} key={index} />)}
        </article>
      ))}
    </div>
  );
}

function ActivityText({ text }: { text: string }) {
  const segments = parseToolCalls(text);
  if (segments.some((segment) => segment.kind === 'tool-call')) {
    return (
      <div className="connections-activity-text">
        {segments.map((segment, index) => segment.kind === 'text'
          ? <span key={index}>{segment.text}</span>
          : <ToolCallBlock key={index} calls={segment.calls} />)}
      </div>
    );
  }
  const json = prettyJson(text);
  return json === undefined
    ? <div className="connections-activity-text">{text}</div>
    : <pre className="connections-activity-text connections-activity-json">{json}</pre>;
}

function Preamble({ preamble }: { preamble: string }) {
  const html = renderMarkdown(preamble);
  return <div className="connections-preamble">
    {html === undefined ? preamble : <div dangerouslySetInnerHTML={{ __html: html }} />}
  </div>;
}

function Answer({ answer }: { answer: string }) {
  const html = renderMarkdown(answer);
  return <div className="connections-answer">
    {html === undefined ? answer : <div dangerouslySetInnerHTML={{ __html: html }} />}
  </div>;
}
