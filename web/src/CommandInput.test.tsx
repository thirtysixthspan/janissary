import React, { createRef } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CommandInput, type CommandInputDropHandle } from './CommandInput';

function renderCommandInput(overrides: { history?: string[]; ghostHistory?: string[]; busy?: boolean } = {}) {
  const inputRef = createRef<HTMLTextAreaElement>();
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
      busy={overrides.busy ?? false}
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
    const input = screen.getByRole('textbox') as HTMLTextAreaElement;
    await userEvent.type(input, 'git');
    fireEvent.keyDown(input, { key: 'ArrowRight' });
    expect(input).toHaveValue('git status');
  });

  it('ArrowRight mid-text does not accept the ghost', async () => {
    renderCommandInput({ ghostHistory: ['git status'] });
    const input = screen.getByRole('textbox') as HTMLTextAreaElement;
    await userEvent.type(input, 'git');
    input.setSelectionRange(1, 1);
    fireEvent.keyDown(input, { key: 'ArrowRight' });
    expect(input).toHaveValue('git');
  });

  it('End at end-of-input accepts the ghost', async () => {
    renderCommandInput({ ghostHistory: ['git status'] });
    const input = screen.getByRole('textbox') as HTMLTextAreaElement;
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
    const input = screen.getByRole('textbox') as HTMLTextAreaElement;
    await userEvent.type(input, 'glo');
    fireEvent.keyDown(input, { key: 'ArrowRight' });
    expect(input).toHaveValue('global cmd');
  });
});

describe('CommandInput — busy', () => {
  it('shows the bare prompt and no blinking dot when idle', () => {
    renderCommandInput({ busy: false });
    expect(screen.getByText('❯')).toBeInTheDocument();
    expect(document.querySelector('.dot.busy')).toBeNull();
  });

  it('shows the "queue ❯" prompt and a blinking dot when busy', () => {
    renderCommandInput({ busy: true });
    expect(screen.getByText('queue ❯')).toBeInTheDocument();
    expect(document.querySelector('.dot.busy')).not.toBeNull();
  });
});

describe('CommandInput — queueOpen', () => {
  function renderQueueOpen(overrides: { onDeleteQueued?: () => void; onEditQueued?: (text: string) => void; value?: string } = {}) {
    const inputRef = createRef<HTMLTextAreaElement>();
    const onSubmit = vi.fn();
    const onDeleteQueued = overrides.onDeleteQueued ?? vi.fn();
    const onEditQueued = overrides.onEditQueued ?? vi.fn();
    render(
      <CommandInput
        dotColor="#fff"
        history={[]}
        ghostHistory={[]}
        onSubmit={onSubmit}
        inputRef={inputRef}
        complete={vi.fn().mockResolvedValue({ completions: [], cursor: 0 })}
        pickerOpen={false}
        busy={false}
        queueOpen
        onDeleteQueued={onDeleteQueued}
        onEditQueued={onEditQueued}
      />,
    );
    return { onSubmit, onDeleteQueued, onEditQueued };
  }

  it('Enter does not submit', () => {
    const { onSubmit } = renderQueueOpen();
    const input = screen.getByRole('textbox');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('Backspace on an empty line deletes the selected row instead of editing', () => {
    const { onDeleteQueued } = renderQueueOpen();
    const input = screen.getByRole('textbox');
    fireEvent.keyDown(input, { key: 'Backspace' });
    expect(onDeleteQueued).toHaveBeenCalled();
  });

  it('Backspace with text present edits normally, not deleting the row', async () => {
    const { onDeleteQueued } = renderQueueOpen();
    const input = screen.getByRole('textbox');
    await userEvent.type(input, 'abc');
    fireEvent.keyDown(input, { key: 'Backspace' });
    expect(onDeleteQueued).not.toHaveBeenCalled();
  });

  it('typing patches the selected row via onEditQueued', async () => {
    const { onEditQueued } = renderQueueOpen();
    const input = screen.getByRole('textbox');
    await userEvent.type(input, 'a');
    expect(onEditQueued).toHaveBeenCalledWith('a');
  });
});

describe('CommandInput — multi-line', () => {
  it('Shift+Enter inserts a newline instead of submitting', async () => {
    const { onSubmit } = renderCommandInput();
    const input = screen.getByRole('textbox');
    await userEvent.type(input, 'hello{Shift>}{Enter}{/Shift}world');
    expect(input).toHaveValue('hello\nworld');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('Ctrl+Enter submits', async () => {
    const { onSubmit } = renderCommandInput();
    const input = screen.getByRole('textbox');
    await userEvent.type(input, 'hello{Control>}{Enter}{/Control}');
    expect(onSubmit).toHaveBeenCalledWith('hello');
  });

  it('submits the full multi-line text on Enter', async () => {
    const { onSubmit } = renderCommandInput();
    const input = screen.getByRole('textbox');
    await userEvent.type(input, 'line1{Shift>}{Enter}{/Shift}line2{Enter}');
    expect(onSubmit).toHaveBeenCalledWith('line1\nline2');
  });

  it('ArrowUp on the first line of multi-line text recalls history', () => {
    renderCommandInput({ history: ['recalled'] });
    const input = screen.getByRole('textbox') as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: 'line1\nline2' } });
    input.setSelectionRange(0, 0);
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(input).toHaveValue('recalled');
  });

  it('ArrowUp on an interior line of multi-line text does not recall history', () => {
    renderCommandInput({ history: ['recalled'] });
    const input = screen.getByRole('textbox') as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: 'line1\nline2' } });
    input.setSelectionRange(7, 7); // on "line2", after the newline
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(input).toHaveValue('line1\nline2');
  });

  it('ArrowDown on the last line of multi-line text recalls history', () => {
    renderCommandInput({ history: ['first', 'second'] });
    const input = screen.getByRole('textbox') as HTMLTextAreaElement;
    fireEvent.keyDown(input, { key: 'ArrowUp' }); // histIndex now points at 'second'
    fireEvent.change(input, { target: { value: 'line1\nline2' } });
    input.setSelectionRange(11, 11); // end of text, last line
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input).toHaveValue(''); // advanced past the end of history and cleared
  });

  it('ArrowDown after recalling an older entry recalls the next-newer one', () => {
    renderCommandInput({ history: ['first', 'second'] });
    const input = screen.getByRole('textbox') as HTMLTextAreaElement;
    fireEvent.keyDown(input, { key: 'ArrowUp' }); // histIndex now points at 'second'
    fireEvent.keyDown(input, { key: 'ArrowUp' }); // histIndex now points at 'first'
    expect(input).toHaveValue('first');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input).toHaveValue('second');
  });

  it('auto-resizes to fit multi-line content', async () => {
    renderCommandInput();
    const input = screen.getByRole('textbox') as HTMLTextAreaElement;
    Object.defineProperty(input, 'scrollHeight', { configurable: true, get: () => (input.value.includes('\n') ? 60 : 20) });
    await userEvent.type(input, 'hello{Shift>}{Enter}{/Shift}world');
    expect(input.style.height).toBe('60px');
  });

  it('does not attempt completion for an empty token at the start of a new line', () => {
    const complete = vi.fn().mockResolvedValue({ newInput: '', newCursor: 0, matches: [] });
    const inputRef = createRef<HTMLTextAreaElement>();
    render(
      <CommandInput
        dotColor="#fff"
        history={[]}
        ghostHistory={[]}
        onSubmit={vi.fn()}
        inputRef={inputRef}
        complete={complete}
        pickerOpen={false}
        busy={false}
      />,
    );
    const input = screen.getByRole('textbox') as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: 'line1\n' } });
    input.setSelectionRange(6, 6); // right after the newline, nothing typed yet on line 2
    fireEvent.keyDown(input, { key: 'Tab' });
    expect(complete).not.toHaveBeenCalled();
  });
});

describe('CommandInput — drop handle', () => {
  function renderWithDropRef() {
    const inputRef = createRef<HTMLTextAreaElement>();
    const dropRef = createRef<CommandInputDropHandle | null>() as React.RefObject<CommandInputDropHandle | null>;
    const { container } = render(
      <CommandInput
        dotColor="#fff"
        history={['recalled']}
        ghostHistory={[]}
        onSubmit={vi.fn()}
        inputRef={inputRef}
        complete={vi.fn().mockResolvedValue({ completions: [], cursor: 0 })}
        pickerOpen={false}
        busy={false}
        dropRef={dropRef}
      />,
    );
    return { inputRef, dropRef, container };
  }

  it('inserts text into an empty box', () => {
    const { inputRef, dropRef } = renderWithDropRef();
    act(() => { dropRef.current?.insertAtCaret('src/index.ts'); });
    expect(inputRef.current).toHaveValue('src/index.ts');
  });

  it('inserts at a mid-string caret position', async () => {
    const { dropRef } = renderWithDropRef();
    const input = screen.getByRole('textbox') as HTMLTextAreaElement;
    await userEvent.type(input, 'open ');
    input.setSelectionRange(5, 5);
    act(() => { dropRef.current?.insertAtCaret('src/index.ts'); });
    expect(input).toHaveValue('open src/index.ts');
  });

  it('replaces an active selection', async () => {
    const { dropRef } = renderWithDropRef();
    const input = screen.getByRole('textbox') as HTMLTextAreaElement;
    await userEvent.type(input, 'open oldpath');
    input.setSelectionRange(5, 12);
    act(() => { dropRef.current?.insertAtCaret('newpath'); });
    expect(input).toHaveValue('open newpath');
  });

  it('inserts via document.execCommand when the browser supports it', async () => {
    const execCommand = vi.fn();
    document.execCommand = execCommand;
    try {
      const { dropRef } = renderWithDropRef();
      const input = screen.getByRole('textbox') as HTMLTextAreaElement;
      await userEvent.type(input, 'open ');
      input.setSelectionRange(5, 5);
      act(() => { dropRef.current?.insertAtCaret('src/index.ts'); });
      expect(execCommand).toHaveBeenCalledWith('insertText', false, 'src/index.ts');
    } finally {
      // @ts-expect-error jsdom does not implement execCommand by default; restore that.
      delete document.execCommand;
    }
  });

  it('leaves recall (replace-all) behavior unchanged when a dropRef is also provided', async () => {
    renderWithDropRef();
    const input = screen.getByRole('textbox');
    await userEvent.type(input, '{ArrowUp}');
    expect(input).toHaveValue('recalled');
  });

  it('setDropHighlighted toggles the drop-target class on the root element', () => {
    const { dropRef, container } = renderWithDropRef();
    const root = container.querySelector('.command-area')!;
    act(() => { dropRef.current?.setDropHighlighted(true); });
    expect(root.className).toContain('drop-target');
    act(() => { dropRef.current?.setDropHighlighted(false); });
    expect(root.className).not.toContain('drop-target');
  });
});
