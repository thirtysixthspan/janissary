import React from 'react';
import type { ConnectionWindow } from '@shared/plugins/connections/shared';
import { renderMarkdown } from '../api';

export function ConnectionHistory({ window }: { window: ConnectionWindow | undefined }) {
  if (!window) return <div className="connections-history-loading">Loading connection history…</div>;
  return (
    <div className="connections-history-content">
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
