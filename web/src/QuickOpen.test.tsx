import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { QuickOpen } from './QuickOpen';
import type { FuzzyMatchResult } from './fuzzy-match';

function renderQuickOpen(overrides: Partial<React.ComponentProps<typeof QuickOpen>> = {}) {
  const onChangeQuery = vi.fn();
  const onChangeSelected = vi.fn();
  const onPick = vi.fn();
  const onClose = vi.fn();
  const commandInputRef = { current: document.createElement('textarea') };
  const utils = render(
    <QuickOpen
      query=""
      onChangeQuery={onChangeQuery}
      results={[]}
      selected={0}
      onChangeSelected={onChangeSelected}
      loading={false}
      onPick={onPick}
      onClose={onClose}
      commandInputRef={commandInputRef}
      {...overrides}
    />,
  );
  return { ...utils, onChangeQuery, onChangeSelected, onPick, onClose, commandInputRef };
}

const results: FuzzyMatchResult[] = [
  { path: 'web/src/App.tsx', score: 10, ranges: [[8, 11]] },
  { path: 'web/src/Api.ts', score: 5, ranges: [[8, 10]] },
];

describe('QuickOpen', () => {
  it('shows Searching… while loading', () => {
    renderQuickOpen({ loading: true, query: 'app' });
    expect(screen.getByText('Searching…')).toBeInTheDocument();
  });

  it('shows the type-to-search hint for an empty query with no rows', () => {
    renderQuickOpen({ query: '' });
    expect(screen.getByText('type to search')).toBeInTheDocument();
  });

  it('renders capped ranked rows with filename and dimmed path, without highlighting matches', () => {
    renderQuickOpen({ query: 'app', results });
    expect(screen.getAllByText(/\.tsx?$/, { exact: false }).length).toBeGreaterThan(0);
    const marks = document.querySelectorAll('.quick-open-row mark');
    expect(marks.length).toBe(0);
    expect(document.querySelector('.quick-open-dir')).toHaveTextContent('web/src');
  });

  it('moves the selection on ArrowDown/ArrowUp without the keys reaching the window', () => {
    const { onChangeSelected } = renderQuickOpen({ query: 'app', results, selected: 0 });
    const input = screen.getByRole('textbox');
    const windowListener = vi.fn();
    globalThis.addEventListener('keydown', windowListener);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(onChangeSelected).toHaveBeenCalledWith(1);
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(onChangeSelected).toHaveBeenCalledWith(0);
    expect(windowListener).not.toHaveBeenCalled();
    globalThis.removeEventListener('keydown', windowListener);
  });

  it('Enter calls onPick with the selected result\'s path', () => {
    const { onPick } = renderQuickOpen({ query: 'app', results, selected: 1 });
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
    expect(onPick).toHaveBeenCalledWith('web/src/Api.ts');
  });

  it('shows No matching files for a non-matching query, and Enter is a no-op', () => {
    const { onPick } = renderQuickOpen({ query: 'zzz', results: [] });
    expect(screen.getByText('No matching files')).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
    expect(onPick).not.toHaveBeenCalled();
  });

  it('Escape calls onClose and refocuses the command input', () => {
    const { onClose, commandInputRef } = renderQuickOpen({ query: 'app', results });
    const focusSpy = vi.spyOn(commandInputRef.current!, 'focus');
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
    expect(focusSpy).toHaveBeenCalled();
  });

  it('typed characters flow through onChangeQuery', () => {
    const { onChangeQuery } = renderQuickOpen();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'quick' } });
    expect(onChangeQuery).toHaveBeenCalledWith('quick');
  });

  it('clicking a row calls onPick with its path', () => {
    const { onPick } = renderQuickOpen({ query: 'app', results });
    fireEvent.click(document.querySelectorAll('.quick-open-row')[1]);
    expect(onPick).toHaveBeenCalledWith('web/src/Api.ts');
  });
});
