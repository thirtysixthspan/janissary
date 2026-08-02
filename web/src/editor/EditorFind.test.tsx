import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { FuzzyMatchResult } from '../fuzzy-match';
import { EditorFind } from './EditorFind';

const results: FuzzyMatchResult[] = [
  { path: 'function beta() {', index: 4, score: 10, ranges: [[9, 13]] },
  { path: '  const b = 2;', index: 9, score: 5, ranges: [[8, 9]] },
];

function renderFind(overrides: Partial<React.ComponentProps<typeof EditorFind>> = {}) {
  const onChangeQuery = vi.fn();
  const onChangeSelected = vi.fn();
  const onClose = vi.fn();
  const utils = render(
    <EditorFind
      query="beta"
      onChangeQuery={onChangeQuery}
      results={results}
      selected={0}
      onChangeSelected={onChangeSelected}
      onClose={onClose}
      {...overrides}
    />,
  );
  return { ...utils, onChangeQuery, onChangeSelected, onClose };
}

const input = () => screen.getByPlaceholderText('Search buffer');

describe('EditorFind', () => {
  it('renders an autofocused input naming the buffer', () => {
    renderFind();
    expect(input()).toBeInTheDocument();
    expect(document.activeElement).toBe(input());
  });

  it('hints at typing while the query is empty', () => {
    renderFind({ query: '', results: [] });
    expect(screen.getByText('type to search')).toBeInTheDocument();
  });

  it('reports a query that matches no line', () => {
    renderFind({ query: 'zzz', results: [] });
    expect(screen.getByText('No matching lines')).toBeInTheDocument();
  });

  it('renders one row per match with a 1-based line number and the line text', () => {
    const { container } = renderFind();
    const numbers = [...container.querySelectorAll('.editor-find-line')].map((n) => n.textContent);
    const texts = [...container.querySelectorAll('.editor-find-text')].map((n) => n.textContent);
    expect(numbers).toEqual(['5', '10']);
    expect(texts).toEqual(['function beta() {', '  const b = 2;']);
  });

  it('emphasizes exactly the matched characters', () => {
    const { container } = renderFind();
    const marks = [...container.querySelectorAll(':scope .editor-find-row mark')].map((m) => m.textContent);
    expect(marks).toEqual(['beta', 'b']);
  });

  it('marks the selected row', () => {
    const { container } = renderFind({ selected: 1 });
    const rows = [...container.querySelectorAll('.editor-find-row')];
    expect(rows[0].className).not.toContain('selected');
    expect(rows[1].className).toContain('selected');
  });

  it('moves the selection with ArrowDown and ArrowUp, stopping at the ends', () => {
    const { onChangeSelected } = renderFind();
    fireEvent.keyDown(input(), { key: 'ArrowDown' });
    expect(onChangeSelected).toHaveBeenCalledWith(1);

    fireEvent.keyDown(input(), { key: 'ArrowUp' });
    expect(onChangeSelected).toHaveBeenLastCalledWith(0);
  });

  it('closes on Escape', () => {
    const { onClose } = renderFind();
    fireEvent.keyDown(input(), { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('does not close on Enter — the jump already happened live', () => {
    const { onClose, onChangeSelected } = renderFind();
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(onClose).not.toHaveBeenCalled();
    expect(onChangeSelected).not.toHaveBeenCalled();
  });

  it('reports typed queries', () => {
    const { onChangeQuery } = renderFind();
    fireEvent.change(input(), { target: { value: 'gamma' } });
    expect(onChangeQuery).toHaveBeenCalledWith('gamma');
  });

  it('selects a clicked row', () => {
    const { container, onChangeSelected } = renderFind();
    fireEvent.click(container.querySelectorAll('.editor-find-row')[1]);
    expect(onChangeSelected).toHaveBeenCalledWith(1);
  });

  it('keeps its keystrokes off the surfaces behind it', () => {
    const spy = vi.fn();
    renderFind();
    globalThis.addEventListener('keydown', spy);
    fireEvent.keyDown(input(), { key: 'ArrowDown' });
    globalThis.removeEventListener('keydown', spy);
    expect(spy).not.toHaveBeenCalled();
  });
});
