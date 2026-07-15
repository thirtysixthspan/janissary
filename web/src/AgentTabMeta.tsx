import React from 'react';
import { tabFlagDisplay } from './tab-flag-display';

type Properties = { cwd?: string; flags?: string[] };

export function AgentTabMeta({ cwd, flags }: Properties) {
  return (
    <div className="tab-meta">
      <span className="tab-cwd">{cwd}</span>
      <span className="tab-flags">
        {(flags ?? []).map((flag) => {
          const display = tabFlagDisplay[flag];
          if (!display) return null;
          return (
            <span key={flag} className="tab-flag" role="img" aria-label={display.label} title={display.label}>
              {display.emoji}
            </span>
          );
        })}
      </span>
    </div>
  );
}
