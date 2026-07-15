import React from 'react';
import { tabFlagDisplay } from './tab-flag-display';

type Properties = { cwd?: string; flags?: string[]; onOpenFileNavigator?: () => void };

export function AgentTabMeta({ cwd, flags, onOpenFileNavigator }: Properties) {
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
      {onOpenFileNavigator && (
        <button
          type="button"
          className="tab-open-files"
          title="Open file navigator here"
          onClick={onOpenFileNavigator}
        >
          📁
        </button>
      )}
    </div>
  );
}
