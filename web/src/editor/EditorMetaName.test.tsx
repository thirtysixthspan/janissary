import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EditorView } from '@shared/protocol';
import { EditorMetaName } from './EditorMetaName';

function makeView(overrides: Partial<EditorView> = {}): EditorView {
  return { name: 'notes.txt', path: '/home/user/notes.txt', size: '12 B', url: '/open/1', ...overrides };
}

type Harness = {
  commit: ReturnType<typeof vi.fn>;
  cancel: ReturnType<typeof vi.fn>;
  rerender: (view: EditorView) => void;
};

function setup(view: EditorView): Harness {
  const commit = vi.fn();
  const cancel = vi.fn();
  const result = render(<EditorMetaName editor={view} onCommit={commit} onCancel={cancel} />);
  return {
    commit, cancel,
    rerender: (next) => result.rerender(<EditorMetaName editor={next} onCommit={commit} onCancel={cancel} />),
  };
}

const input = () => screen.getByRole('textbox') as HTMLInputElement;

beforeEach(() => { vi.clearAllMocks(); });

describe('EditorMetaName', () => {
  it('renders the name as a static span', () => {
    setup(makeView());
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(document.querySelector('.editor-name')?.textContent).toBe('notes.txt');
  });

  it('auto-starts the rename for a new-file view with the input focused and selected', () => {
    setup(makeView({ name: 'untitled.md', newFile: true }));
    const field = input();
    expect(field).toHaveFocus();
    expect(field.value).toBe('untitled.md');
    expect(field.selectionStart).toBe(0);
    expect(field.selectionEnd).toBe('untitled.md'.length);
  });

  it('auto-starts the rename only once, even after later newFile rerenders', () => {
    const view = makeView({ name: 'untitled.md', newFile: true });
    const jigs = setup(view);
    fireEvent.keyDown(input(), { key: 'Escape' });
    jigs.rerender(view);
    jigs.rerender(view);
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('does not auto-start the rename for an existing file', () => {
    setup(makeView());
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('double-clicking the name starts the edit pre-filled', () => {
    setup(makeView());
    expect(screen.queryByRole('textbox')).toBeNull();
    fireEvent.doubleClick(screen.getByText('notes.txt'));
    expect(input().value).toBe('notes.txt');
  });

  it('enter commits the typed name', () => {
    const jigs = setup(makeView({ name: 'untitled.md', newFile: true }));
    fireEvent.change(input(), { target: { value: 'plan.md' } });
    const notPrevented = fireEvent.keyDown(input(), { key: 'Enter' });
    expect(notPrevented).toBe(false);
    expect(jigs.commit).toHaveBeenCalledWith('plan.md');
    expect(jigs.cancel).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('escape cancels without renaming', () => {
    const jigs = setup(makeView({ name: 'untitled.md', newFile: true }));
    fireEvent.change(input(), { target: { value: 'typed-name.md' } });
    fireEvent.keyDown(input(), { key: 'Escape' });
    expect(jigs.commit).not.toHaveBeenCalled();
    expect(jigs.cancel).toHaveBeenCalled();
    expect(screen.getByText('untitled.md')).toBeInTheDocument();
  });

  it('clicking away cancels an uncommitted edit', () => {
    const jigs = setup(makeView({ name: 'untitled.md', newFile: true }));
    fireEvent.blur(input());
    expect(jigs.commit).not.toHaveBeenCalled();
    expect(jigs.cancel).toHaveBeenCalled();
  });

  it('a committed name equal to the current one cancels instead of renaming', () => {
    const jigs = setup(makeView({ name: 'untitled.md', newFile: true }));
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(jigs.commit).not.toHaveBeenCalled();
    expect(jigs.cancel).toHaveBeenCalled();
  });
});
