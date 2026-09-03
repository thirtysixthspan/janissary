import React, { useRef, useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useCommandBarKeys } from './useCommandBarKeys';

// A bare textarea rather than `CommandBarShell`, so a failure here is the keymap's and never the
// chrome's. The ghost is rendered as text so the tests can read what the hook computed.
function Harness({
  history, ghostHistory, onSubmit, onClear, initial = '',
}: {
  history: string[];
  ghostHistory?: string[];
  onSubmit: (text: string) => void;
  onClear?: () => void;
  initial?: string;
}) {
  const [value, setValue] = useState(initial);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const bar = useCommandBarKeys({ value, setValue, inputRef, history, ghostHistory, onSubmit, onClear });
  return (
    <>
      <textarea
        aria-label="Command"
        ref={inputRef}
        value={value}
        onChange={(event) => { setValue(event.target.value); }}
        onKeyDown={bar.onKeyDown}
      />
      <span data-testid="ghost">{bar.ghost ?? ''}</span>
    </>
  );
}

function renderKeys(properties: Partial<React.ComponentProps<typeof Harness>> = {}) {
  const onSubmit = vi.fn();
  render(<Harness history={[]} onSubmit={onSubmit} {...properties} />);
  return { onSubmit, input: screen.getByLabelText('Command') as HTMLTextAreaElement };
}

describe('useCommandBarKeys — submitting', () => {
  it('submits the trimmed value on Enter and clears the input', () => {
    const { onSubmit, input } = renderKeys();
    fireEvent.change(input, { target: { value: '  git status  ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSubmit).toHaveBeenCalledWith('git status');
    expect(input).toHaveValue('');
  });

  it('clears without submitting when only whitespace was typed', () => {
    const { onSubmit, input } = renderKeys();
    fireEvent.change(input, { target: { value: ' '.repeat(3) } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSubmit).not.toHaveBeenCalled();
    expect(input).toHaveValue('');
  });

  it('submits on Ctrl+Enter as well', () => {
    const { onSubmit, input } = renderKeys();
    fireEvent.change(input, { target: { value: 'run' } });
    fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true });
    expect(onSubmit).toHaveBeenCalledWith('run');
  });

  it('inserts a newline on Shift+Enter and submits nothing', () => {
    const { onSubmit, input } = renderKeys();
    fireEvent.change(input, { target: { value: 'first' } });
    input.setSelectionRange(5, 5);
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    expect(onSubmit).not.toHaveBeenCalled();
    expect(input.value).toBe('first\n');
  });

  // The agent bar drops its completion strip here, and does so whether or not there was text.
  it('reports every clear, including one with nothing to submit', () => {
    const onClear = vi.fn();
    const { input } = renderKeys({ onClear });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.change(input, { target: { value: 'run' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onClear).toHaveBeenCalledTimes(2);
  });
});

describe('useCommandBarKeys — history', () => {
  it('walks back through history on ArrowUp and forward on ArrowDown', () => {
    const { input } = renderKeys({ history: ['first', 'second'] });
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(input).toHaveValue('second');
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(input).toHaveValue('first');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input).toHaveValue('second');
  });

  it('restores the draft after walking back past the newest entry', () => {
    const { input } = renderKeys({ history: ['first'] });
    fireEvent.change(input, { target: { value: 'in progress' } });
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input).toHaveValue('in progress');
  });

  // Off the first/last line the arrow is moving the caret, and recalling would throw the value away.
  it('leaves a caret in the middle of a multi-line value alone', () => {
    const { input } = renderKeys({ history: ['first'] });
    fireEvent.change(input, { target: { value: 'one\ntwo\nthree' } });
    input.setSelectionRange(5, 5);
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input).toHaveValue('one\ntwo\nthree');
  });

  it('ignores an arrow held with a modifier, which is selecting rather than recalling', () => {
    const { input } = renderKeys({ history: ['first'] });
    fireEvent.keyDown(input, { key: 'ArrowUp', shiftKey: true });
    expect(input).toHaveValue('');
  });
});

describe('useCommandBarKeys — ghost text', () => {
  it('suggests the newest history entry that extends the typed text', () => {
    const { input } = renderKeys({ history: ['git stash', 'git status'] });
    fireEvent.change(input, { target: { value: 'git st' } });
    expect(screen.getByTestId('ghost')).toHaveTextContent('git status');
  });

  it('suggests nothing when the typed text matches no entry', () => {
    const { input } = renderKeys({ history: ['git status'] });
    fireEvent.change(input, { target: { value: 'ls' } });
    expect(screen.getByTestId('ghost')).toHaveTextContent('');
  });

  // The agent bar recalls its own tab's commands while completing from every tab's.
  it('completes from ghostHistory when it is given separately from history', () => {
    const { input } = renderKeys({ history: [], ghostHistory: ['deploy staging'] });
    fireEvent.change(input, { target: { value: 'dep' } });
    expect(screen.getByTestId('ghost')).toHaveTextContent('deploy staging');
  });

  it.each(['ArrowRight', 'End'])('accepts the suggestion on %s with the caret at the end', (key) => {
    const { input } = renderKeys({ history: ['git status'] });
    fireEvent.change(input, { target: { value: 'git' } });
    input.setSelectionRange(3, 3);
    fireEvent.keyDown(input, { key });
    expect(input).toHaveValue('git status');
  });

  it('leaves the value alone when the caret is not at the end', () => {
    const { input } = renderKeys({ history: ['git status'] });
    fireEvent.change(input, { target: { value: 'git' } });
    input.setSelectionRange(1, 1);
    fireEvent.keyDown(input, { key: 'ArrowRight' });
    expect(input).toHaveValue('git');
  });
});
