import React from 'react';
import type { SuggestionView } from '@shared/protocol';

// Feed body of one monitor's reporting tab (`view === 'monitor'`): newest suggestion at
// the top, new arrivals pushing older ones down. The scroll position rests at the top;
// scrolling down walks back through the suggestion history. Suggestions flow as plain
// text (no row chrome, no buttons); a suggestion that carries a command shows it as a
// clickable line that triggers the run (executed server-side in the tab the suggestion
// is about, then removed from the feed).
export function MonitorTab({ suggestions, onRun }: {
  suggestions: SuggestionView[];
  onRun: (id: string) => void;
}) {
  if (suggestions.length === 0) {
    return <div className="monitor-view monitor-empty">No suggestions yet.</div>;
  }

  return (
    <div className="monitor-view">
      {suggestions.toReversed().map((s) => (
        <div className="monitor-suggestion" key={s.id}>
          {s.text}
          {s.command && (
            <button type="button" className="cmd" onClick={() => onRun(s.id)}>{s.command}</button>
          )}
        </div>
      ))}
    </div>
  );
}
