import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { selectedIcon } from './icons';

// Shared picker overlay listing selectable theme names with the active one checkmarked. Up/Down
// move the selection and Return picks — both handled by App's key handler; rows are also clickable.
// `swatch` renders optional per-row preview content (e.g. app-theme color chips) before the name.
type Properties = {
  title: string;
  themes: string[];
  active: string;
  selected: number;
  onPick: (name: string) => void;
  swatch?: (name: string) => React.ReactNode;
};

export function ThemeListPicker({ title, themes, active, selected, onPick, swatch }: Properties) {
  return (
    <div className="picker">
      <div className="picker-title">{title}</div>
      {themes.map((name, index) => (
        <div
          key={name}
          className={`picker-row${index === selected ? ' selected' : ''}`}
          onClick={() => onPick(name)}
        >
          {swatch?.(name)}
          {name === active ? <><FontAwesomeIcon icon={selectedIcon} /> </> : '  '}{name}
        </div>
      ))}
    </div>
  );
}
