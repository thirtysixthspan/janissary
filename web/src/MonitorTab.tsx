import React from 'react';
import type { SuggestionView } from '@shared/protocol';

// A byte count formatted as b/kb/mb, one decimal place above 1000.
function formatBytes(n: number): string {
  if (n < 1000) return `${n}b`;
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}kb`;
  return `${(n / 1_000_000).toFixed(1)}mb`;
}

// Feed body of one monitor's reporting tab (`view === 'monitor'`): a metadata line (persona,
// monitored tabs/groups, ACP context size) above the accumulated suggestions, newest at the
// top, new arrivals pushing older ones down. The scroll position rests at the top; scrolling
// down walks back through the suggestion history. Suggestions flow as plain text; a suggestion
// that carries a command shows it as a clickable line that triggers the run (executed
// server-side in the tab the suggestion is about; the suggestion stays in the feed). Each
// suggestion carries 👍/👎 rating buttons — both feed the rating back to the monitoring AI and
// remove the suggestion from the feed (rating it means the user is done with it).
export function MonitorTab({ persona, targets, contextBytes, suggestions, onRun, onRate, onReset }: {
  persona: string;
  targets: string;
  contextBytes: number;
  suggestions: SuggestionView[];
  onRun: (id: string) => void;
  onRate: (id: string, up: boolean) => void;
  onReset: () => void;
}) {
  const header = (
    <div className="monitor-header">
      <div className="monitor-meta">
        <span className="monitor-persona">{persona}</span>
        <span className="monitor-targets">{targets}</span>
        <span className="monitor-context">{formatBytes(contextBytes)}</span>
      </div>
      <div className="monitor-actions">
        <button type="button" className="monitor-reset" title="Reset context" onClick={onReset}>↺</button>
      </div>
    </div>
  );

  if (suggestions.length === 0) {
    return (
      <>
        {header}
        <div className="monitor-view monitor-empty">No suggestions yet.</div>
      </>
    );
  }

  return (
    <>
      {header}
      <div className="monitor-view">
      {suggestions.toReversed().map((s) => (
        <div className="monitor-suggestion" key={s.id}>
          <span className="text">
            {s.text}
            {s.command && (
              <button type="button" className="cmd" onClick={() => onRun(s.id)}>{s.command}</button>
            )}
          </span>
          <span className="rate">
            <button type="button" aria-label="Helpful" title="Helpful" onClick={() => onRate(s.id, true)}>👍</button>
            <button type="button" aria-label="Not helpful" title="Not helpful" onClick={() => onRate(s.id, false)}>👎</button>
          </span>
        </div>
      ))}
      </div>
    </>
  );
}
