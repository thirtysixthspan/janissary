import React from 'react';
import type { ConnectionWindow } from '@shared/plugins/connections/shared';
import { renderMarkdown } from '../api';

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
        <article className="connections-block" key={`${block.startedAt}:${index}`}>
          <div className="connections-prompt">{block.prompt}</div>
          {block.entries.map((entry, entryIndex) => {
            const content = <div className="connections-activity-text">{entry.text}</div>;
            return entry.kind === 'thought' || entry.kind === 'tool'
              ? <details className="connections-activity" key={`${entry.timestamp}:${entryIndex}`}>
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

function Answer({ answer }: { answer: string }) {
  const html = renderMarkdown(answer);
  return <div className="connections-answer">
    {html === undefined ? answer : <div dangerouslySetInnerHTML={{ __html: html }} />}
  </div>;
}
