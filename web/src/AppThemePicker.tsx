import React from 'react';

// The `theme` overlay listing every application color theme, with the active one marked. Each row
// carries a swatch whose wrapper sets `data-theme={name}`, so the CSS cascade resolves the chips
// to that theme's own palette — no color values in TypeScript. Up/Down move the selection, Return
// picks, Escape closes — handled by App's key handler (mirrors ThemePicker); rows are clickable.
type Properties = { themes: string[]; active: string; selected: number; onPick: (name: string) => void };

export function AppThemePicker({ themes, active, selected, onPick }: Properties) {
  return (
    <div className="picker">
      <div className="picker-title">theme</div>
      {themes.map((name, index) => (
        <div
          key={name}
          className={`picker-row${index === selected ? ' selected' : ''}`}
          onClick={() => onPick(name)}
        >
          <span className="theme-swatch" data-theme={name}>
            <span className="chip chip-bg" />
            <span className="chip chip-fg" />
            <span className="chip chip-accent" />
          </span>
          {name === active ? '✓ ' : '  '}{name}
        </div>
      ))}
    </div>
  );
}
