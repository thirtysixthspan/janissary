import React, { createRef } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CommandInput } from './CommandInput';

function renderCommandInput(overrides: { history?: string[]; ghostHistory?: string[] } = {}) {
  const inputRef = createRef<HTMLInputElement>();
  const onSubmit = vi.fn();
  const complete = vi.fn().mockResolvedValue({ completions: [], cursor: 0 });
  render(
    <CommandInput
      dotColor="#fff"
      history={overrides.history ?? []}
      ghostHistory={overrides.ghostHistory ?? []}
      onSubmit={onSubmit}
      inputRef={inputRef}
      complete={complete}
      pickerOpen={false}
    />,
  );
  return { inputRef, onSubmit };
}

describe('CommandInput — recall', () => {
  it('submits typed text on Enter', async () => {
    const { onSubmit } = renderCommandInput();
    const input = screen.getByRole('textbox');
    await userEvent.type(input, 'git status{Enter}');
    expect(onSubmit).toHaveBeenCalledWith('git status');
  });

  it('recalls history entries on ArrowUp', async () => {
    renderCommandInput({ history: ['first', 'second'] });
    const input = screen.getByRole('textbox');
    await userEvent.type(input, '{ArrowUp}');
    expect(input).toHaveValue('second');
  });
});

describe('CommandInput — ghost text', () => {
  it('renders a ghost when typed text matches a ghostHistory entry prefix', async () => {
    const { inputRef } = renderCommandInput({ ghostHistory: ['git status'] });
    const input = screen.getByRole('textbox');
    await userEvent.type(input, 'git');
    expect(inputRef.current?.parentElement?.querySelector('.ghost')).not.toBeNull();
  });

  it('renders no ghost when nothing matches', async () => {
    const { inputRef } = renderCommandInput({ ghostHistory: ['git status'] });
    const input = screen.getByRole('textbox');
    await userEvent.type(input, 'ls');
    expect(inputRef.current?.parentElement?.querySelector('.ghost')).toBeNull();
  });

  it('ArrowRight at end-of-input accepts the ghost', async () => {
    renderCommandInput({ ghostHistory: ['git status'] });
    const input = screen.getByRole('textbox') as HTMLInputElement;
    await userEvent.type(input, 'git');
    fireEvent.keyDown(input, { key: 'ArrowRight' });
    expect(input).toHaveValue('git status');
  });

  it('ArrowRight mid-text does not accept the ghost', async () => {
    renderCommandInput({ ghostHistory: ['git status'] });
    const input = screen.getByRole('textbox') as HTMLInputElement;
    await userEvent.type(input, 'git');
    input.setSelectionRange(1, 1);
    fireEvent.keyDown(input, { key: 'ArrowRight' });
    expect(input).toHaveValue('git');
  });

  it('End at end-of-input accepts the ghost', async () => {
    renderCommandInput({ ghostHistory: ['git status'] });
    const input = screen.getByRole('textbox') as HTMLInputElement;
    await userEvent.type(input, 'git');
    fireEvent.keyDown(input, { key: 'End' });
    expect(input).toHaveValue('git status');
  });

  it('submits only the typed value when Enter is pressed without accepting', async () => {
    const { onSubmit } = renderCommandInput({ ghostHistory: ['git status'] });
    const input = screen.getByRole('textbox');
    await userEvent.type(input, 'git{Enter}');
    expect(onSubmit).toHaveBeenCalledWith('git');
  });

  it('ghost text appears for a command only in ghostHistory, not in history', async () => {
    const { inputRef } = renderCommandInput({ history: [], ghostHistory: ['deploy prod'] });
    const input = screen.getByRole('textbox');
    await userEvent.type(input, 'dep');
    expect(inputRef.current?.parentElement?.querySelector('.ghost')).not.toBeNull();
  });

  it('ArrowUp recalls from history, never from ghostHistory', async () => {
    renderCommandInput({ history: ['tab-local cmd'], ghostHistory: ['global-only cmd'] });
    const input = screen.getByRole('textbox');
    await userEvent.type(input, '{ArrowUp}');
    expect(input).toHaveValue('tab-local cmd');
  });

  it('ArrowRight accepts a ghost sourced from ghostHistory', async () => {
    renderCommandInput({ history: [], ghostHistory: ['global cmd'] });
    const input = screen.getByRole('textbox') as HTMLInputElement;
    await userEvent.type(input, 'glo');
    fireEvent.keyDown(input, { key: 'ArrowRight' });
    expect(input).toHaveValue('global cmd');
  });
});
