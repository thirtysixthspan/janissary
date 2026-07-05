import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ThemePicker } from './ThemePicker';

describe('ThemePicker', () => {
  it('renders the shared theme list with the active one marked', () => {
    render(<ThemePicker themes={['github-dark', 'nord', 'monokai']} active="nord" selected={1} onPick={() => {}} />);
    expect(screen.getByText(/✓ nord/)).toBeInTheDocument();
    expect(screen.getByText('github-dark', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('monokai', { exact: false })).toBeInTheDocument();
  });

  it('calls onPick with the theme name on click', () => {
    const onPick = vi.fn();
    render(<ThemePicker themes={['github-dark', 'nord']} active="github-dark" selected={0} onPick={onPick} />);
    fireEvent.click(screen.getByText(/nord/));
    expect(onPick).toHaveBeenCalledWith('nord');
  });

  it('marks the selected row', () => {
    const { container } = render(<ThemePicker themes={['github-dark', 'nord']} active="github-dark" selected={1} onPick={() => {}} />);
    const rows = [...container.querySelectorAll(':scope .picker-row')];
    expect(rows[1].className).toContain('selected');
    expect(rows[0].className).not.toContain('selected');
  });
});
