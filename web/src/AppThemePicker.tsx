import React from 'react';
import { ThemeListPicker } from './ThemeListPicker';

// The `theme` overlay listing every application color theme, with the active one marked. Each row
// carries a swatch whose wrapper sets `data-theme={name}`, so the CSS cascade resolves the chips
// to that theme's own palette — no color values in TypeScript. Up/Down move the selection, Return
// picks, Escape closes — handled by App's key handler (mirrors ThemePicker); rows are clickable.
type Properties = { themes: string[]; active: string; selected: number; onPick: (name: string) => void };

export function AppThemePicker({ themes, active, selected, onPick }: Properties) {
  return (
    <ThemeListPicker
      title="theme"
      themes={themes}
      active={active}
      selected={selected}
      onPick={onPick}
      swatch={(name) => (
        <span className="theme-swatch" data-theme={name}>
          <span className="chip chip-bg" />
          <span className="chip chip-fg" />
          <span className="chip chip-accent" />
        </span>
      )}
    />
  );
}
