import React from 'react';
import type { ConnectionWindow } from '@shared/plugins/connections/shared';
import { renderMarkdown } from '../api';
import { prettyJson } from './activity-text';

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
          {block.entries.map((entry, entryIndex) => {
            const content = <ActivityText text={entry.text} />;
            return entry.kind === 'thought' || entry.kind === 'tool'
              ? <details className="connections-activity" key={`${entry.timestamp}:${entryIndex}`}
                  open={entry.kind === 'tool'}>
                  <summary>{entry.kind}</summary>{content}
                </details>
              : <div className="connections-activity" key={`${entry.timestamp}:${entryIndex}`}>
                  <div className="connections-activity-label">{entry.kind}</div>{content}
                </div>;
          })}
          {block.answer !== undefined && <Answer answer={block.answer} />}
        </article>
      ))}
    </div>
  );
}

function ActivityText({ text }: { text: string }) {
  const json = prettyJson(text);
  return json === undefined
    ? <div className="connections-activity-text">{text}</div>
    : <pre className="connections-activity-text connections-activity-json">{json}</pre>;
}

function Answer({ answer }: { answer: string }) {
  const html = renderMarkdown(answer);
  return <div className="connections-answer">
    {html === undefined ? answer : <div dangerouslySetInnerHTML={{ __html: html }} />}
  </div>;
}
