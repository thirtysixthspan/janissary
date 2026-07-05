import React from 'react';

// The `syntax theme` overlay listing every available syntax-highlighting theme, with the active
// one marked. Up/Down move the selection, Return picks the selected theme, Escape closes —
// handled by App's key handler (mirrors HistoryPicker); a row can also be clicked to pick it.
type Properties = { themes: string[]; active: string; selected: number; onPick: (name: string) => void };

export function ThemePicker({ themes, active, selected, onPick }: Properties) {
  return (
    <div className="picker">
      <div className="picker-title">syntax theme</div>
      {themes.map((name, index) => (
        <div
          key={name}
          className={`picker-row${index === selected ? ' selected' : ''}`}
          onClick={() => onPick(name)}
        >
          {name === active ? '✓ ' : '  '}{name}
        </div>
      ))}
    </div>
  );
}
