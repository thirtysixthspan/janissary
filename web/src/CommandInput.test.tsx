import React, { createRef } from 'react';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CommandInput } from './CommandInput';

function renderCommandInput(overrides: { history?: string[] } = {}) {
  const inputRef = createRef<HTMLInputElement>();
  const prefillRef: { current: ((text: string) => void) | null } = { current: null };
  const onSubmit = vi.fn();
  const complete = vi.fn().mockResolvedValue({ completions: [], cursor: 0 });
  render(
    <CommandInput
      dotColor="#fff"
      history={overrides.history ?? []}
      onSubmit={onSubmit}
      inputRef={inputRef}
      prefillRef={prefillRef}
      complete={complete}
      pickerOpen={false}
    />,
  );
  return { inputRef, prefillRef, onSubmit };
}

describe('CommandInput — prefillRef', () => {
  it('sets the input value when prefillRef.current is called', () => {
    const { prefillRef } = renderCommandInput();
    act(() => { prefillRef.current!('git status'); });
    expect(screen.getByRole('textbox')).toHaveValue('git status');
  });

  it('submits the prefilled text on Enter', async () => {
    const { prefillRef, onSubmit } = renderCommandInput();
    act(() => { prefillRef.current!('git status'); });
    await userEvent.type(screen.getByRole('textbox'), '{Enter}');
    expect(onSubmit).toHaveBeenCalledWith('git status');
  });

  it('recalls the most recent history entry on ArrowUp after prefill', async () => {
    const { prefillRef } = renderCommandInput({ history: ['first', 'second'] });
    act(() => { prefillRef.current!('git status'); });
    await userEvent.type(screen.getByRole('textbox'), '{ArrowUp}');
    expect(screen.getByRole('textbox')).toHaveValue('second');
  });
});
