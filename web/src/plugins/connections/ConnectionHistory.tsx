import React from 'react';
import type { ConnectionWindow } from '@shared/plugins/connections/shared';
import { groupToolEntries, parseToolCalls, prettyJson } from './activity-text';
import { ToolCallBlock } from './ToolCallBlock';

export function ConnectionHistory({ window }: { window: ConnectionWindow | undefined }) {
  if (!window) return <div className="connections-history-loading">Loading connection history…</div>;
  return (
    <div className="connections-history-content">
      {window.blocks.map((block, index) => (
        <article className="connections-block" key={window.offset + index}>
          {block.preamble !== undefined && <Preamble preamble={block.preamble} />}
          <details className="connections-activity" open>
            <summary>query</summary>
            <div className="connections-prompt">{block.prompt}</div>
          </details>
          {groupToolEntries(block.entries).map((row) => {
            if (row.kind === 'tool') {
              const parts = row.reply === undefined ? [row.command] : [row.command, row.reply];
              return (
                <details className="connections-activity" key={`${row.command.timestamp}:${row.index}`}>
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
  return <details className="connections-activity">
    <summary>preamble</summary>
    <div className="connections-preamble">{preamble}</div>
  </details>;
}

