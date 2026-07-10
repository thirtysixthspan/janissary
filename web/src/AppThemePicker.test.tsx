import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { AppThemePicker } from './AppThemePicker';
import { APP_THEMES } from '@shared/app-themes';

describe('AppThemePicker', () => {
  it('renders every theme with the active one marked', () => {
    const { container } = render(<AppThemePicker themes={APP_THEMES} active="nord" selected={0} onPick={() => {}} />);
    expect(screen.getByText(/✓ nord/)).toBeInTheDocument();
    const rows = [...container.querySelectorAll(':scope .picker-row')].map((row) => row.textContent?.trim());
    expect(rows).toEqual(APP_THEMES.map((name) => (name === 'nord' ? `✓ ${name}` : name)));
  });

  it('renders one data-theme scoped swatch per theme', () => {
    const { container } = render(<AppThemePicker themes={APP_THEMES} active="dark" selected={0} onPick={() => {}} />);
    const swatches = [...container.querySelectorAll<HTMLElement>(':scope .theme-swatch')];
    expect(swatches).toHaveLength(APP_THEMES.length);
    expect(swatches.map((s) => s.dataset.theme)).toEqual(APP_THEMES);
  });

  it('calls onPick with the theme name on click', () => {
    const onPick = vi.fn();
    render(<AppThemePicker themes={['dark', 'nord']} active="dark" selected={0} onPick={onPick} />);
    fireEvent.click(screen.getByText(/nord/));
    expect(onPick).toHaveBeenCalledWith('nord');
  });

  it('marks the selected row', () => {
    const { container } = render(<AppThemePicker themes={['dark', 'nord']} active="dark" selected={1} onPick={() => {}} />);
    const rows = [...container.querySelectorAll(':scope .picker-row')];
    expect(rows[1].className).toContain('selected');
    expect(rows[0].className).not.toContain('selected');
  });
});
