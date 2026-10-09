import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DiffFile, DiffPayload } from '@shared/plugins/diff/shared';
import type { TabPluginClientCapabilities } from '../api';
import { DiffTab } from './DiffTab';
import { syntaxSegments } from './syntax-segments';

vi.mock('./syntax-segments', async (importOriginal) => {
  const actual = await importOriginal<{ syntaxSegments: typeof syntaxSegments }>();
  return { ...actual, syntaxSegments: vi.fn(actual.syntaxSegments) };
});

Element.prototype.scrollIntoView ??= () => {};

function file(overrides: Partial<DiffFile> = {}): DiffFile {
  return { path: 'a.ts', additions: 2, deletions: 2, hunks: [{ oldStart: 1, newStart: 1, lines: [
    { kind: 'context', number: 1, oldNumber: 1, jump: 1, text: 'const kept = 0;' },
    { kind: 'removed', number: 2, oldNumber: 2, jump: 2, text: 'const first = 30;' },
    { kind: 'removed', number: 3, oldNumber: 3, jump: 2, text: 'const second = 40;' },
    { kind: 'added', number: 2, jump: 2, text: 'const first = 60;' },
    { kind: 'added', number: 3, jump: 3, text: 'const second = 80;' },
    { kind: 'context', number: 4, oldNumber: 4, jump: 4, text: 'const tail = 0;' },
  ] }], ...overrides };
}

function payload(overrides: Partial<DiffPayload> = {}): DiffPayload {
  return { root: '$root/', state: 'done', message: '', split: false, files: [file()], ...overrides };
}

function twoHunks(): DiffFile {
  const first = file();
  return { ...first, hunks: [...first.hunks, { oldStart: 20, newStart: 20, lines: [
    { kind: 'added', number: 20, jump: 20, text: 'const later = 20;' },
  ] }] };
}

function show(value = payload()) {
  const requests = vi.fn<(name: string, payload: unknown) => Promise<unknown>>(async () => null);
  const capabilities: TabPluginClientCapabilities = {
    resourceUrl: (reference) => reference,
    intent: <Result,>(name: string, value: unknown) => requests(name, value) as Promise<Result>,
    copyText: vi.fn(), splitAction: null, active: true, dock: null, close: vi.fn(), reportFailure: vi.fn(),
  };
  const view = render(<DiffTab payload={value} capabilities={capabilities} />);
  return { ...view, requests, update: (next: DiffPayload) => view.rerender(<DiffTab payload={next} capabilities={capabilities} />) };
}

function begin(side = 'modified', number = 2): HTMLTextAreaElement {
  fireEvent.click(screen.getByRole('button', { name: `Add comment on ${side} line ${number}` }));
  return screen.getByRole('textbox', { name: `Comment on ${side} line ${number}` });
}

function save(text: string, side = 'modified', number = 2): void {
  fireEvent.change(begin(side, number), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: 'Save comment' }));
}

describe('unified inline comments', () => {
  it('does not rerender source segments when typing a comment', () => {
    show();
    const input = begin();
    vi.mocked(syntaxSegments).mockClear();
    fireEvent.change(input, { target: { value: 'Review' } });
    fireEvent.change(input, { target: { value: 'Review this' } });
    expect(syntaxSegments).not.toHaveBeenCalled();
  });

  it('preserves indentation, truly empty lines, and whitespace-only source lines', () => {
    const { container } = show(payload({ files: [file({ additions: 1, deletions: 1, hunks: [{ oldStart: 1, newStart: 1, lines: [
      { kind: 'context', number: 1, oldNumber: 1, jump: 1, text: '    const kept = 0;' },
      { kind: 'context', number: 2, oldNumber: 2, jump: 2, text: '' },
      { kind: 'context', number: 3, oldNumber: 3, jump: 3, text: '\t ' },
      { kind: 'removed', number: 4, oldNumber: 4, jump: 4, text: 'const value = 1;' },
      { kind: 'added', number: 4, jump: 4, text: 'const value = 2;' },
    ] }] })] }));
    expect([...container.querySelectorAll(':scope .diff-line.diff-context .diff-text')].map((node) => node.textContent))
      .toEqual(['    const kept = 0;', '', '\t ']);
  });

  it('forgets local notes when the diff tab closes and opens again', () => {
    const view = show();
    save('Temporary review');
    view.unmount();
    show();
    expect(screen.queryByText('Temporary review')).toBeNull();
  });

  it('adds, edits, cancels edits, and deletes a local comment without sending it anywhere', () => {
    const { container, requests } = show();
    const input = begin();
    expect((screen.getByRole('button', { name: 'Save comment' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.submit(input.form!);
    expect(screen.getByRole('textbox')).toBe(input);
    fireEvent.change(input, { target: { value: '<b>Review & note</b>\nSecond line' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save comment' }));
    expect(container.querySelector(':scope .diff-line-comment p')?.textContent).toBe('<b>Review & note</b>\nSecond line');
    expect(container.querySelector(':scope .diff-line-comment b')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Edit comment on modified line 2' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'discard' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(container.querySelector(':scope .diff-line-comment p')?.textContent).toContain('Review & note');
    fireEvent.click(screen.getByRole('button', { name: 'Edit comment on modified line 2' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Revised note' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save comment' }));
    expect(screen.getByText('Revised note')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Delete comment on modified line 2' }));
    expect(container.querySelector('.diff-line-comment')).toBeNull();
    expect(requests).not.toHaveBeenCalled();
  });

  it('keeps original and modified notes separate at the same line number', () => {
    const { container } = show();
    save('Original note', 'original');
    save('Modified note');
    const original = container.querySelector('.diff-line.diff-removed')!.parentElement!;
    const modified = container.querySelector('.diff-line.diff-added')!.parentElement!;
    expect(original.querySelector(':scope .diff-line-comment p')?.textContent).toBe('Original note');
    expect(modified.querySelector(':scope .diff-line-comment p')?.textContent).toBe('Modified note');
  });

  it('retains an original-side note when its line becomes unchanged context', () => {
    const { update } = show();
    save('Original review', 'original');
    const current = file({ additions: 1, deletions: 1 });
    current.hunks[0].lines = current.hunks[0].lines.flatMap((line) => {
      if (line.kind === 'removed' && line.number === 2) return [{ ...line, kind: 'context' as const }];
      return line.kind === 'added' && line.number === 2 ? [] : [line];
    });
    update(payload({ files: [current] }));
    expect(screen.getByText('Original review')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Edit saved comment on original line 2' }));
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('Original review');
  });

  it('retains drafts through refresh, collapse, and layout switches', () => {
    const { update } = show();
    fireEvent.change(begin(), { target: { value: 'Draft review' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add comment on modified line 2' }));
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('Draft review');
    update(payload());
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('Draft review');
    fireEvent.click(screen.getByRole('button', { name: 'Collapse this file' }));
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Show more context' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Expand this file' }));
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('Draft review');
    update(payload({ split: true }));
    expect(screen.queryByRole('textbox')).toBeNull();
    update(payload());
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('Draft review');
    fireEvent.click(screen.getByRole('button', { name: 'Save comment' }));
    update(payload());
    expect(screen.getByText('Draft review')).toBeTruthy();
  });

  it('identifies changed annotated text and forgets comments when the root changes', () => {
    const { update } = show();
    save('Check this expression');
    const changed = file();
    changed.hunks[0].lines = changed.hunks[0].lines.map((line) => line.kind === 'added' && line.number === 2
      ? { ...line, text: 'const first = 999;' } : line);
    update(payload({ files: [changed] }));
    expect(screen.getByText('Check this expression')).toBeTruthy();
    expect(screen.getByText(/Line changed since this comment/)).toBeTruthy();
    update(payload({ root: '$root/other', files: [changed] }));
    expect(screen.queryByText('Check this expression')).toBeNull();
  });

  it('keeps root and filename identities distinct when they contain colons', () => {
    const { update } = show(payload({ root: '$root/a:b', files: [file({ path: 'c.ts' })] }));
    save('Root-specific note');
    update(payload({ root: '$root/a', files: [file({ path: 'b:c.ts' })] }));
    expect(screen.queryByText('Root-specific note')).toBeNull();
  });

  it('preserves a draft when context expansion merges its hunk into an earlier one', () => {
    const initial = file();
    const later = { oldStart: 20, newStart: 20, lines: [
      { kind: 'context' as const, number: 20, oldNumber: 20, jump: 20, text: 'const near = 20;' },
      { kind: 'added' as const, number: 21, jump: 21, text: 'const extra = 21;' },
    ] };
    const { update } = show(payload({ files: [{ ...initial, hunks: [...initial.hunks, later] }] }));
    fireEvent.change(begin('modified', 21), { target: { value: 'Still drafting' } });
    update(payload({ files: [{ ...initial, contextLines: 23, hunks: [{ ...initial.hunks[0],
      lines: [...initial.hunks[0].lines, ...later.lines],
    }] }] }));
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('Still drafting');
  });

  it('keeps comment editor keys and mouse events from navigating hunks or opening files', () => {
    const { container, requests } = show(payload({ files: [twoHunks()] }));
    const selected = container.querySelector<HTMLElement>('.diff-walked')?.dataset.index;
    const input = begin();
    expect(document.activeElement).toBe(input);
    fireEvent.mouseDown(input);
    expect(document.activeElement).toBe(input);
    for (const key of ['j', 'k', 'ArrowDown', 'ArrowUp', 'Enter']) fireEvent.keyDown(input, { key });
    expect(requests).not.toHaveBeenCalled();
    expect(container.querySelector<HTMLElement>('.diff-walked')?.dataset.index).toBe(selected);
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('keeps source selection and line targeting usable beside comment controls', () => {
    const { container, requests } = show();
    const text = container.querySelector(':scope .diff-line.diff-added .diff-text')!;
    const range = document.createRange();
    range.selectNodeContents(text);
    const selection = globalThis.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    expect(selection.toString()).toBe('const first = 60;');
    selection.removeAllRanges();
    fireEvent.doubleClick(container.querySelector(':scope .diff-line.diff-removed .diff-text')!);
    fireEvent.doubleClick(screen.getByRole('button', { name: 'Add comment on modified line 2' }));
    expect(requests).not.toHaveBeenCalled();
    fireEvent.doubleClick(text.querySelector('.hljs-keyword')!);
    expect(requests).toHaveBeenCalledWith('open', { path: 'a.ts', line: 2 });
  });
});

describe('context controls', () => {
  it('requests context for the current file and renders expanded lines in the same body without changing counts', async () => {
    const { requests, container, update } = show();
    const body = container.querySelector('.diff-body');
    fireEvent.click(screen.getByRole('button', { name: 'Show more context' }));
    await waitFor(() => { expect(requests).toHaveBeenCalledWith('context', { path: 'a.ts' }); });
    const expanded = file({ contextLines: 23, canExpandContext: false });
    expanded.hunks[0].lines.push({ kind: 'context', number: 5, oldNumber: 5, jump: 5, text: 'const expanded = 5;' });
    update(payload({ files: [expanded] }));
    expect(container.querySelector('.diff-body')).toBe(body);
    expect([...container.querySelectorAll('.diff-text')].map((node) => node.textContent)).toContain('const expanded = 5;');
    expect(container.querySelector('.diff-added-count')?.textContent).toBe('+2');
    expect(container.querySelector('.diff-removed-count')?.textContent).toBe('−2');
    expect(screen.queryByRole('button', { name: 'Show more context' })).toBeNull();
  });

  it('disables duplicate requests while pending and does not collapse the file on double click', async () => {
    const { requests, update } = show();
    let resolveRequest: (value: unknown) => void = () => {};
    // eslint-disable-next-line unicorn/prefer-promise-with-resolvers -- The web project uses the ES2023 library.
    const pending = new Promise<unknown>((resolve) => { resolveRequest = resolve; });
    requests.mockReturnValueOnce(pending);
    const button = screen.getByRole('button', { name: 'Show more context' }) as HTMLButtonElement;
    fireEvent.click(button);
    expect(button.disabled).toBe(true);
    fireEvent.doubleClick(button);
    expect(screen.getByRole('button', { name: 'Collapse this file' })).toBeTruthy();
    await act(async () => { resolveRequest(null); await pending; });
    update(payload({ files: [file({ expandingContext: true })] }));
    expect((screen.getByRole('button', { name: 'Show more context' }) as HTMLButtonElement).disabled).toBe(true);
    expect(requests).toHaveBeenCalledTimes(1);
  });

  it('shows recoverable request and server errors', async () => {
    const { requests, update } = show();
    requests.mockRejectedValueOnce(new Error('Request failed'));
    fireEvent.click(screen.getByRole('button', { name: 'Show more context' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Request failed');
    fireEvent.click(screen.getByRole('button', { name: 'Show more context' }));
    await waitFor(() => { expect(screen.queryByRole('alert')).toBeNull(); });
    update(payload({ files: [file({ contextError: 'Git failed' })] }));
    expect(screen.getAllByRole('alert')[0].textContent).toContain('Git failed');
  });

  it('shows a complete file in the diff and restores the condensed view without losing the scroll position', async () => {
    const { requests, container, update } = show();
    const body = container.querySelector<HTMLElement>('.diff-body')!;
    body.scrollTop = 120;
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Show full file' }));
      await Promise.resolve();
    });
    expect(requests).toHaveBeenCalledWith('context', { path: 'a.ts', fullFile: true });
    const expanded = file({ contextLines: 1_000_000, expandingContext: false, canExpandContext: false });
    expanded.hunks[0].lines.push({ kind: 'context', number: 5, oldNumber: 5, jump: 5, text: 'const expanded = 5;' });
    update(payload({ files: [expanded] }));
    expect(screen.getByRole('button', { name: 'Show condensed diff' })).toBeTruthy();
    expect(body.scrollTop).toBe(120);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Show condensed diff' }));
      await Promise.resolve();
    });
    expect(requests).toHaveBeenNthCalledWith(2, 'context', { path: 'a.ts', fullFile: false });
  });

  it.each([{ added: true }, { deleted: true }, { binary: true }, { canExpandContext: false }])
    ('hides expansion for a file that cannot reveal context: %j', (overrides) => {
      show(payload({ files: [file(overrides)] }));
      expect(screen.queryByRole('button', { name: 'Show more context' })).toBeNull();
    });

  it('leaves keyboard events on file controls to those controls', () => {
    const { requests, container } = show(payload({ files: [twoHunks()] }));
    const selected = container.querySelector<HTMLElement>('.diff-walked')?.dataset.index;
    const button = screen.getByRole('button', { name: 'Show more context' });
    for (const key of ['j', 'ArrowDown', 'Enter']) fireEvent.keyDown(button, { key });
    expect(requests).not.toHaveBeenCalled();
    expect(container.querySelector<HTMLElement>('.diff-walked')?.dataset.index).toBe(selected);
  });
});
