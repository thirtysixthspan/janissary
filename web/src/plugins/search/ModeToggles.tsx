import React from 'react';
import type { SearchIntent } from '@shared/plugins/search/shared';

export type ModeKey = 'regex' | 'matchCase' | 'wholeWord';

const TOGGLES: { key: ModeKey; label: string; title: string }[] = [
  { key: 'regex', label: '.*', title: 'Regular expression' },
  { key: 'matchCase', label: 'Aa', title: 'Match case' },
  { key: 'wholeWord', label: 'W', title: 'Whole word' },
];

// The three query modifiers, on the command line beside the query they read rather than in the
// metadata bar a row away from it. One click reruns the search with the new mode, so the button
// reports its own state and the tab owns the rerun.
export function ModeToggles({ modes, onToggle }: {
  modes: Pick<SearchIntent, ModeKey>;
  onToggle(key: ModeKey): void;
}) {
  return (
    <span className="search-toggles">
      {TOGGLES.map((toggle) => (
        <button
          key={toggle.key}
          type="button"
          className={modes[toggle.key] ? 'on' : ''}
          title={toggle.title}
          aria-label={toggle.title}
          aria-pressed={modes[toggle.key]}
          onClick={() => onToggle(toggle.key)}
        >
          {toggle.label}
        </button>
      ))}
    </span>
  );
}
