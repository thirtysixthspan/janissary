import React from 'react';
import { tabFlagDisplay } from './tab-flag-display';

type Properties = { cwd?: string; flags?: string[]; model?: string; effort?: string; onOpenFileNavigator?: () => void };

function MetaChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="tab-meta-chip" aria-label={label} title={`${label}: ${value}`}>
      {value}
    </span>
  );
}

export function AgentTabMeta({ cwd, flags, model, effort, onOpenFileNavigator }: Properties) {
  return (
    <div className="tab-meta">
      <span className="tab-cwd">{cwd}</span>
      {model !== undefined && <MetaChip label="Model" value={model} />}
      {effort !== undefined && <MetaChip label="Effort" value={effort} />}
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
