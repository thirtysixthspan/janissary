import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { FileNavigatorCommitPopup } from './FileNavigatorCommitPopup';
import { defaultCommitMessage, defaultCommitMessageForCount } from './file-navigator-commit-message';

function renderPopup(defaultMessage = 'commit: notes.md') {
  const onCommit = vi.fn();
  const onCancel = vi.fn();
  const utils = render(
    <FileNavigatorCommitPopup
      defaultMessage={defaultMessage}
      onCommit={onCommit}
      onCancel={onCancel}
    />,
  );
  const input = screen.getByLabelText('Commit message') as HTMLInputElement;
  return { ...utils, input, onCommit, onCancel };
}

describe('defaultCommitMessage', () => {
  it('names a single file outright', () => {
    expect(defaultCommitMessage(['src/notes.md'])).toBe('commit: notes.md');
  });

  it('counts anything else', () => {
    expect(defaultCommitMessage(['a.md', 'b.md', 'c.md'])).toBe('commit: 3 files');
  });
});

describe('defaultCommitMessageForCount', () => {
  it('reads zero when there is nothing changed', () => {
    expect(defaultCommitMessageForCount(0)).toBe('commit: 0 files');
  });

  it('reads a singular file for a count of one, without naming it', () => {
    expect(defaultCommitMessageForCount(1)).toBe('commit: 1 file');
  });

  it('counts several', () => {
    expect(defaultCommitMessageForCount(3)).toBe('commit: 3 files');
  });
});

describe('FileNavigatorCommitPopup', () => {
  it('opens pre-filled and focused', () => {
    const { input } = renderPopup(defaultCommitMessage(['src/notes.md']));
    expect(input.value).toBe('commit: notes.md');
    expect(document.activeElement).toBe(input);
  });

  it('opens pre-filled with the counted form for several files', () => {
    const { input } = renderPopup(defaultCommitMessage(['a.md', 'b.md']));
    expect(input.value).toBe('commit: 2 files');
  });

  it('sends the typed message on Enter', () => {
    const { input, onCommit, onCancel } = renderPopup();
    fireEvent.change(input, { target: { value: 'fix the parser' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCommit).toHaveBeenCalledWith('fix the parser');
    expect(onCancel).not.toHaveBeenCalled();
  });

  it.each(['', ' '.repeat(3)])('cancels rather than committing a message of %j', (value) => {
    const { input, onCommit, onCancel } = renderPopup();
    fireEvent.change(input, { target: { value } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCommit).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('cancels on Escape without sending', () => {
    const { input, onCommit, onCancel } = renderPopup();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('keeps its text and sends nothing when it loses focus', () => {
    const { input, onCommit, onCancel } = renderPopup();
    fireEvent.change(input, { target: { value: 'still typing' } });
    fireEvent.blur(input);
    expect(onCommit).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
    expect((screen.getByLabelText('Commit message') as HTMLInputElement).value).toBe('still typing');
  });

  it('keeps keystrokes from reaching the tree behind it', () => {
    const treeKeyDown = vi.fn();
    const onCommit = vi.fn();
    render(
      <div onKeyDown={treeKeyDown}>
        <FileNavigatorCommitPopup defaultMessage="commit: a.md" onCommit={onCommit} onCancel={vi.fn()} />
      </div>,
    );
    fireEvent.keyDown(screen.getByLabelText('Commit message'), { key: 'a' });
    expect(treeKeyDown).not.toHaveBeenCalled();
  });
});
