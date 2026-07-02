import React from 'react';
import type { SuggestionView } from '@shared/protocol';

// Feed body of one monitor's reporting tab (`view === 'monitor'`): the accumulated
// suggestions, newest at the top, new arrivals pushing older ones down. The scroll
// position rests at the top; scrolling down walks back through the suggestion history.
// Suggestions flow as plain text; a suggestion that carries a command shows it as a
// clickable line that triggers the run (executed server-side in the tab the suggestion
// is about; the suggestion stays in the feed). Each suggestion carries 👍/👎 rating
// buttons — both feed the rating back to the monitoring AI and remove the suggestion
// from the feed (rating it means the user is done with it).
export function MonitorTab({ suggestions, onRun, onRate }: {
  suggestions: SuggestionView[];
  onRun: (id: string) => void;
  onRate: (id: string, up: boolean) => void;
}) {
  if (suggestions.length === 0) {
    return <div className="monitor-view monitor-empty">No suggestions yet.</div>;
  }

  return (
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
  );
}
