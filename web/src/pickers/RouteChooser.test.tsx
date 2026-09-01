import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import React from 'react';
import { RouteChooser } from './RouteChooser';

describe('RouteChooser', () => {
  it('renders the command in the title', () => {
    const { getByText } = render(React.createElement(RouteChooser, { cmd: 'run', choices: [], selected: 0, onPick: vi.fn() }));
    expect(getByText('route: run')).toBeTruthy();
  });

  it('renders all choices', () => {
    const { getByText } = render(React.createElement(RouteChooser, { cmd: 'run', choices: ['shell', 'db: test'], selected: 0, onPick: vi.fn() }));
    expect(getByText('shell')).toBeTruthy();
    expect(getByText('db: test')).toBeTruthy();
  });

  it('marks the selected choice with the selected class', () => {
    const { container } = render(React.createElement(RouteChooser, { cmd: 'run', choices: ['shell', 'db: test'], selected: 1, onPick: vi.fn() }));
    const rows = container.querySelectorAll('.picker-row');
    expect(rows[0].classList.contains('selected')).toBe(false);
    expect(rows[1].classList.contains('selected')).toBe(true);
  });

  it('calls onPick with the index when a row is clicked', () => {
    const onPick = vi.fn();
    const { container } = render(React.createElement(RouteChooser, { cmd: 'run', choices: ['shell', 'db: test'], selected: 0, onPick }));
    fireEvent.click(container.querySelectorAll('.picker-row')[1]);
    expect(onPick).toHaveBeenCalledWith(1);
  });
});
