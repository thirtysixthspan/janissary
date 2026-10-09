import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DiffFile, DiffPayload } from '@shared/plugins/diff/shared';
import type { TabPluginClientCapabilities } from '../api';
import { DiffTab } from './DiffTab';
import { CHANGE_LINE_CAP } from './size-cap';

function file(overrides: Partial<DiffFile> = {}): DiffFile {
  return {
    path: 'a.txt', additions: 1, deletions: 1,
    hunks: [{
      oldStart: 1, newStart: 1,
      lines: [
        { kind: 'context', number: 1, jump: 1, text: 'kept' },
        { kind: 'removed', number: 2, jump: 3, text: 'gone' },
        { kind: 'added', number: 3, jump: 3, text: 'here' },
      ],
    }],
    ...overrides,
  };
}

function wholeFile(overrides: Partial<DiffFile> = {}): DiffFile {
  return {
    path: 'a.txt', additions: 3, deletions: 3,
    hunks: [{
      oldStart: 1, newStart: 1,
      lines: [
        { kind: 'removed', number: 1, jump: 1, text: 'old' },
        { kind: 'added', number: 1, jump: 1, text: 'new' },
      ],
    }],
    ...overrides,
  };
}

function oversized(overrides: Partial<DiffFile> = {}): DiffFile {
  return {
    path: 'big.txt', additions: CHANGE_LINE_CAP + 40, deletions: 0,
    hunks: [{
      oldStart: 1, newStart: CHANGE_LINE_CAP + 41,
      lines: [
        { kind: 'context', number: 1, jump: 1, text: 'kept' },
        { kind: 'added', number: 2, jump: 2, text: 'more' },
      ],
    }],
    ...overrides,
  };
}

function payload(overrides: Partial<DiffPayload> = {}): DiffPayload {
  return { root: '$root/', state: 'done', message: '', split: false, files: [file()], ...overrides };
}

function makeCapabilities() {
  const intent = vi.fn<(name: string, payload: unknown) => Promise<unknown>>(async () => null);
  const capabilities: TabPluginClientCapabilities = {
    resourceUrl: (reference) => reference,
    intent: async <Result,>(name: string, payload: unknown) =>
      intent(name, payload) as Promise<Result>,
    copyText: vi.fn(),
    splitAction: null, active: true, dock: null,
    close: vi.fn(), reportFailure: vi.fn(),
  };
  return { capabilities, intent };
}

Element.prototype.scrollIntoView ??= () => {};
const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView');
beforeEach(() => { scrollIntoView.mockClear(); });

const renderTab = (value: DiffPayload = payload()) => {
  const { capabilities, intent } = makeCapabilities();
  const rendered = render(<DiffTab payload={value} capabilities={capabilities} />);
  return { ...rendered, intent };
};

const body = () => document.querySelector('.diff-body') as HTMLElement;

describe('DiffTab', () => {
  it('renders the diffed root and one entry per changed file', () => {
    renderTab(payload({ files: [file({ path: 'a.txt' }), file({ path: 'b.txt', hunks: [] })] }));
    expect(screen.getByText('$root/')).toBeTruthy();
    expect(screen.getByTitle('a.txt').textContent).toBe('a.txt');
    expect(screen.getByTitle('b.txt').textContent).toBe('b.txt');
  });

  it('renders a rename as its old path to its new one', () => {
    renderTab(payload({ files: [file({ oldPath: 'old.txt', path: 'new.txt' })] }));
    expect(screen.getByTitle('new.txt').textContent).toBe('old.txt → new.txt');
  });

  it('renders each line with its file line number and its kind', () => {
    const { container } = renderTab();
    const numbers = [...container.querySelectorAll(':scope .diff-line .diff-number')].map((node) => node.textContent);
    expect(numbers).toEqual(['1', '2', '3']);
    expect([...container.querySelectorAll(':scope .diff-line')].map((node) => node.className)).toEqual([
      'diff-line diff-context', 'diff-line diff-removed', 'diff-line diff-added',
    ]);
  });

  it('shows the add and delete counts on the file header', () => {
    renderTab(payload({ files: [file({ additions: 4, deletions: 2 })] }));
    expect(screen.getByText('+4')).toBeTruthy();
    expect(screen.getByText('−2')).toBeTruthy();
  });

  it('opens a file at its first line on a click of its header', () => {
    const { intent } = renderTab();
    fireEvent.click(screen.getByTitle('a.txt'));
    expect(intent).toHaveBeenCalledWith('open', { path: 'a.txt', line: 1 });
  });

  it('opens a deleted file\'s header as inert, because there is no file to open', () => {
    const { intent } = renderTab(payload({ files: [file({ deleted: true })] }));
    fireEvent.click(screen.getByTitle('a.txt'));
    expect(intent).not.toHaveBeenCalled();
  });

  it('opens nothing for a double-click on a line inside a deleted file', () => {
    const { intent, container } = renderTab(payload({ files: [file({ deleted: true })] }));
    fireEvent.doubleClick(container.querySelectorAll(':scope .diff-line')[1]);
    expect(intent).not.toHaveBeenCalled();
  });

  it('opens the file at a line\'s own position on a double-click of the line', () => {
    const { intent, container } = renderTab();
    fireEvent.doubleClick(container.querySelectorAll('.diff-line')[1]);
    expect(intent).toHaveBeenCalledWith('open', { path: 'a.txt', line: 3 });
  });

  it('opens a binary entry through the media intent rather than the editor', () => {
    const { intent } = renderTab(payload({ files: [file({ binary: true, hunks: [] })] }));
    fireEvent.click(screen.getByTitle('a.txt'));
    expect(intent).toHaveBeenCalledWith('open-media', { path: 'a.txt' });
    expect(intent).not.toHaveBeenCalledWith('open', expect.anything());
  });

  it('names the empty states', () => {
    const { unmount } = renderTab(payload({ state: 'done', files: [] }));
    expect(screen.getByText('No changes')).toBeTruthy();
    unmount();
    const repository = renderTab(payload({ state: 'not-repository', files: [] }));
    expect(screen.getByText('This directory is not a git repository')).toBeTruthy();
    repository.unmount();
    renderTab(payload({ state: 'error', message: 'git diff failed', files: [] }));
    expect(screen.getByText('git diff failed')).toBeTruthy();
  });

  it('refreshes on demand and on its interval', () => {
    vi.useFakeTimers();
    try {
      const { intent } = renderTab();
      expect(intent).not.toHaveBeenCalled();
      fireEvent.click(screen.getByLabelText('Refresh'));
      expect(intent).toHaveBeenCalledWith('refresh', { hideWhitespace: true });
      intent.mockClear();
      act(() => { vi.advanceTimersByTime(1000); });
      expect(intent).toHaveBeenCalledWith('refresh', { hideWhitespace: true });
    } finally {
      vi.useRealTimers();
    }
  });

  it('recomputes when the whitespace toggle changes, having defaulted to on', () => {
    const { intent } = renderTab();
    fireEvent.click(screen.getByTitle('Hide whitespace changes'));
    expect(intent).toHaveBeenCalledWith('refresh', { hideWhitespace: false });
  });

  it('renders the split layout its payload names, where each side carries its own line numbers', () => {
    const { container } = renderTab(payload({ split: true }));
    expect(container.querySelector('.diff-split')).toBeTruthy();
    const cells = [...container.querySelectorAll(':scope .diff-cell .diff-number')].map((node) => node.textContent);
    expect(cells).toEqual(['1', '1', '2', '3']);
    expect(container.querySelectorAll(':scope .diff-cell.diff-removed').length).toBe(1);
    expect(container.querySelectorAll(':scope .diff-cell.diff-added').length).toBe(1);
  });

  it('renders the unified layout when its payload names it', () => {
    const { container } = renderTab(payload({ split: false }));
    expect(container.querySelector('.diff-split')).toBeNull();
    expect([...container.querySelectorAll(':scope .diff-line')].map((node) => node.className)).toEqual([
      'diff-line diff-context', 'diff-line diff-removed', 'diff-line diff-added',
    ]);
  });

  it('asks for the other layout with the layout intent rather than switching on its own', () => {
    const { intent } = renderTab();
    fireEvent.click(screen.getByText('Split'));
    expect(intent).toHaveBeenCalledWith('layout', { split: true });
    intent.mockClear();
    fireEvent.click(screen.getByText('Unified'));
    expect(intent).toHaveBeenCalledWith('layout', { split: false });
  });

  it('walks the changed hunks with the arrows and opens at the walked hunk on Return', () => {
    const { intent } = renderTab(payload({
      files: [file({ path: 'a.txt' }), file({ path: 'b.txt', hunks: file().hunks })],
    }));
    fireEvent.keyDown(body(), { key: 'ArrowDown' });
    fireEvent.keyDown(body(), { key: 'ArrowDown' });
    fireEvent.keyDown(body(), { key: 'Enter' });
    expect(intent).toHaveBeenCalledWith('open', { path: 'b.txt', line: 3 });
  });

  it('stops the walk at the last change rather than wrapping', () => {
    const { intent } = renderTab(payload({ files: [file()] }));
    fireEvent.keyDown(body(), { key: 'ArrowDown' });
    fireEvent.keyDown(body(), { key: 'ArrowDown' });
    fireEvent.keyDown(body(), { key: 'Enter' });
    expect(intent).toHaveBeenCalledWith('open', { path: 'a.txt', line: 3 });
  });

  it('moves the walk to a hunk clicked with the mouse', () => {
    const { intent, container } = renderTab(payload({
      files: [file({ path: 'a.txt' }), file({ path: 'b.txt', hunks: file().hunks })],
    }));
    fireEvent.mouseDown(container.querySelectorAll('.diff-hunk')[1]);
    fireEvent.keyDown(body(), { key: 'Enter' });
    expect(intent).toHaveBeenCalledWith('open', { path: 'b.txt', line: 3 });
  });

  it('opens a whole-file change collapsed, with the way out named', () => {
    const { container } = renderTab(payload({ files: [wholeFile()] }));
    expect(screen.getByText('whole file — double-click to expand')).toBeTruthy();
    expect(container.querySelectorAll('.diff-line').length).toBe(0);
  });

  it('expands a whole-file change to every line on a double-click of its header', () => {
    const { intent, container } = renderTab(payload({ files: [wholeFile()] }));
    fireEvent.doubleClick(container.querySelector('.diff-file-header') as HTMLElement);
    expect([...container.querySelectorAll(':scope .diff-line .diff-text')].map((node) => node.textContent)).toEqual(['old', 'new']);
    expect(intent).not.toHaveBeenCalledWith('open', expect.anything());
  });

  it('collapses an expanded whole-file change again on a second double-click', () => {
    const { container } = renderTab(payload({ files: [wholeFile()] }));
    const header = container.querySelector('.diff-file-header') as HTMLElement;
    fireEvent.doubleClick(header);
    fireEvent.doubleClick(header);
    expect(container.querySelectorAll('.diff-line').length).toBe(0);
  });

  it('opens a deleted file\'s whole-file change collapsed and expands it on a double-click', () => {
    const { container } = renderTab(payload({
      files: [wholeFile({ deleted: true, hunks: [{
        oldStart: 1, newStart: 1,
        lines: [{ kind: 'removed', number: 1, jump: 1, text: 'old' }],
      }] })],
    }));
    expect(container.querySelectorAll('.diff-line').length).toBe(0);
    fireEvent.doubleClick(container.querySelector('.diff-file-header') as HTMLElement);
    expect([...container.querySelectorAll(':scope .diff-line .diff-text')].map((node) => node.textContent)).toEqual(['old']);
  });

  it('marks an added line with its sign and a removed one with its own, context with none', () => {
    const { container } = renderTab();
    expect([...container.querySelectorAll(':scope .diff-line .diff-marker')].map((node) => node.textContent)).toEqual(['', '−', '+']);
  });

  it('marks each side of the split layout by its own sign, with no marker on a context line', () => {
    const { container } = renderTab(payload({ split: true }));
    expect([...container.querySelectorAll(':scope .diff-cell .diff-marker')].map((node) => node.textContent)).toEqual(['', '', '−', '+']);
  });

  it('shows a change with surviving lines without a double-click', () => {
    const { container } = renderTab();
    expect(container.querySelectorAll('.diff-line').length).toBe(3);
  });

  it('opens a change over the cap collapsed, with the cap and the count named', () => {
    const { container } = renderTab(payload({ files: [oversized()] }));
    expect(screen.getByText(`${CHANGE_LINE_CAP + 40} lines over the ${CHANGE_LINE_CAP}-line cap — double-click to expand`)).toBeTruthy();
    expect(container.querySelectorAll('.diff-line').length).toBe(0);
    fireEvent.doubleClick(container.querySelector('.diff-file-header') as HTMLElement);
    expect(container.querySelectorAll('.diff-line').length).toBe(2);
  });

  it('shows a change within the cap with no note and no double-click', () => {
    const { container } = renderTab(payload({ files: [file({ additions: CHANGE_LINE_CAP, deletions: 0 })] }));
    expect(container.querySelector('.diff-large-file')).toBeNull();
    expect(container.querySelectorAll('.diff-line').length).toBe(3);
  });

  it('carries both notes for a whole-file change that is also over the cap', () => {
    const { container } = renderTab(payload({
      files: [oversized({ additions: CHANGE_LINE_CAP + 40, hunks: [{
        oldStart: 1, newStart: 1,
        lines: [{ kind: 'added', number: 1, jump: 1, text: 'new' }],
      }] })],
    }));
    expect(container.querySelector('.diff-whole-file')).toBeTruthy();
    expect(container.querySelector('.diff-large-file')).toBeTruthy();
    expect(container.querySelectorAll('.diff-line').length).toBe(0);
    fireEvent.doubleClick(container.querySelector('.diff-file-header') as HTMLElement);
    expect(container.querySelectorAll('.diff-line').length).toBe(1);
  });

  it('scrolls the walked hunk into view', () => {
    const { container } = renderTab();
    fireEvent.keyDown(body(), { key: 'ArrowDown' });
    expect(scrollIntoView).toHaveBeenCalled();
    expect(container.querySelector('.diff-walked')).toBeTruthy();
  });
});
