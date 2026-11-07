import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { FuzzyMatchResult } from '../fuzzy-match';
import { LineFind } from './LineFind';

const results: FuzzyMatchResult[] = [
  { path: 'function beta() {', index: 4, score: 10, ranges: [[9, 13]] },
  { path: '  const b = 2;', index: 9, score: 5, ranges: [[8, 9]] },
];

function renderFind(overrides: Partial<React.ComponentProps<typeof LineFind>> = {}) {
  const onChangeQuery = vi.fn();
  const onChangeSelected = vi.fn();
  const onClose = vi.fn();
  const utils = render(
    <LineFind
      query="beta"
      onChangeQuery={onChangeQuery}
      results={results}
      selected={0}
      onChangeSelected={onChangeSelected}
      onClose={onClose}
      placeholder="Search buffer"
      {...overrides}
    />,
  );
  return { ...utils, onChangeQuery, onChangeSelected, onClose };
}

const input = () => screen.getByPlaceholderText('Search buffer');

describe('LineFind', () => {
  it('renders an autofocused input naming the buffer', () => {
    renderFind();
    expect(input()).toBeInTheDocument();
    expect(document.activeElement).toBe(input());
  });

  it('names what it searches with the placeholder it is given', () => {
    renderFind({ placeholder: 'Search transcript' });
    const byPlaceholder = screen.getByPlaceholderText('Search transcript');
    expect(byPlaceholder).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Search transcript' })).toBe(byPlaceholder);
  });

  it('passes the input element to the caller through inputRef', () => {
    const inputRef = React.createRef<HTMLInputElement>();
    renderFind({ inputRef });
    expect(inputRef.current).toBe(input());
  });

  it('selects the whole query on Cmd+F without reporting a change or reaching the window', () => {
    const { onChangeQuery } = renderFind();
    const spy = vi.fn();
    globalThis.addEventListener('keydown', spy);
    const prevented = fireEvent.keyDown(input(), { key: 'f', metaKey: true });
    globalThis.removeEventListener('keydown', spy);
    const field = input() as HTMLInputElement;
    expect(prevented).toBe(false);
    expect(field.selectionStart).toBe(0);
    expect(field.selectionEnd).toBe(4);
    expect(onChangeQuery).not.toHaveBeenCalled();
    expect(spy).not.toHaveBeenCalled();
  });

  it('treats a capital F with Cmd as the same select-all chord', () => {
    renderFind();
    const prevented = fireEvent.keyDown(input(), { key: 'F', metaKey: true });
    const field = input() as HTMLInputElement;
    expect(prevented).toBe(false);
    expect(field.selectionStart).toBe(0);
    expect(field.selectionEnd).toBe(4);
  });

  it('leaves Ctrl+F, Cmd+Shift+F, and Cmd+Alt+F to the ranked key handler', () => {
    const spy = vi.fn();
    renderFind();
    globalThis.addEventListener('keydown', spy);
    const ctrlF = fireEvent.keyDown(input(), { key: 'f', ctrlKey: true });
    const shiftF = fireEvent.keyDown(input(), { key: 'f', metaKey: true, shiftKey: true });
    const altF = fireEvent.keyDown(input(), { key: 'f', metaKey: true, altKey: true });
    globalThis.removeEventListener('keydown', spy);
    const field = input() as HTMLInputElement;
    expect(ctrlF).toBe(true);
    expect(shiftF).toBe(true);
    expect(altF).toBe(true);
    expect(field.selectionStart).toBe(field.selectionEnd);
    expect(spy).not.toHaveBeenCalled();
  });

  it('hints at typing while the query is empty', () => {
    renderFind({ query: '', results: [] });
    expect(screen.getByText('type to search')).toBeInTheDocument();
  });

  it('reports a query that matches no line', () => {
    renderFind({ query: 'zzz', results: [] });
    expect(screen.getByText('No matching lines')).toBeInTheDocument();
  });

  it('shows the status in place of the empty-result hint', () => {
    renderFind({ query: 'zzz', results: [], status: 'Reading pages…' });
    expect(screen.getByText('Reading pages…')).toBeInTheDocument();
    expect(screen.queryByText('No matching lines')).toBeNull();
  });

  it('hides the status while the query is empty', () => {
    renderFind({ query: '', results: [], status: 'Reading pages…' });
    expect(screen.queryByText('Reading pages…')).toBeNull();
    expect(screen.getByText('type to search')).toBeInTheDocument();
  });

  it('treats an empty status as absent', () => {
    renderFind({ query: 'zzz', results: [], status: '' });
    expect(screen.getByText('No matching lines')).toBeInTheDocument();
  });

  it('exposes an optional polite announcement as an atomic status', () => {
    renderFind({ announcement: 'Reading document text.' });
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Reading document text.');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveAttribute('aria-atomic', 'true');
  });

  it('adds no announcement status when the caller does not provide one', () => {
    renderFind();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('renders one row per match with a 1-based line number and the line text', () => {
    const { container } = renderFind();
    const numbers = [...container.querySelectorAll('.editor-find-line')].map((n) => n.textContent);
    const texts = [...container.querySelectorAll('.editor-find-text')].map((n) => n.textContent);
    expect(numbers).toEqual(['5', '10']);
    expect(texts).toEqual(['function beta() {', '  const b = 2;']);
  });

  it('replaces the line number with the row label it is given', () => {
    const { container } = renderFind({ rowLabel: (result) => `page ${result.index}` });
    const labels = [...container.querySelectorAll('.editor-find-line')].map((n) => n.textContent);
    expect(labels).toEqual(['page 4', 'page 9']);
  });

  it('renders the status after the rows when the query has results', () => {
    const { container } = renderFind({ status: 'Reading pages…' });
    const rows = [...container.querySelectorAll('.picker-row')];
    expect(rows).toHaveLength(3);
    expect(rows.at(-1)?.textContent).toBe('Reading pages…');
    expect(rows.at(-1)?.className).toContain('picker-empty');
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

  it('selects the first result on Enter without closing the overlay', () => {
    const { onClose, onChangeSelected } = renderFind();
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(onClose).not.toHaveBeenCalled();
    expect(onChangeSelected).toHaveBeenCalledWith(0);
  });

  it('does nothing on Enter when the query has no results', () => {
    const { onChangeSelected } = renderFind({ query: 'zzz', results: [] });
    fireEvent.keyDown(input(), { key: 'Enter' });
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

  it('keeps focus in the input when a row is pressed', () => {
    const { container } = renderFind();
    const pressed = fireEvent.mouseDown(container.querySelectorAll('.editor-find-row')[1]);
    expect(pressed).toBe(false);
    expect(document.activeElement).toBe(input());
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
