import React, { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CommandInput } from './CommandInput';

function renderCommandInput(overrides: { history?: string[] } = {}) {
  const inputRef = createRef<HTMLInputElement>();
  const onSubmit = vi.fn();
  const complete = vi.fn().mockResolvedValue({ completions: [], cursor: 0 });
  render(
    <CommandInput
      dotColor="#fff"
      history={overrides.history ?? []}
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
