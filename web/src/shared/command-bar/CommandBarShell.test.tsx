import React, { createRef, useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CommandBarShell, type CommandBarShellProperties } from './CommandBarShell';
import { commandBarDropHandle } from '../drop-registry';

type Overrides = Partial<Omit<CommandBarShellProperties, 'value' | 'onChange' | 'inputRef'>>;

// The shell is controlled, so the harness owns the value the way both real callers do — otherwise
// typing would never change what it renders and the autosize effect would never re-run.
function Harness({ overrides, initial }: { overrides: Overrides; initial: string }) {
  const [value, setValue] = useState(initial);
  const inputRef = createRef<HTMLTextAreaElement>();
  return (
    <CommandBarShell
      {...overrides}
      value={value}
      onChange={setValue}
      onKeyDown={overrides.onKeyDown ?? (() => {})}
      inputRef={inputRef}
    />
  );
}

function renderShell(overrides: Overrides = {}, initial = '') {
  const rendered = render(<Harness overrides={overrides} initial={initial} />);
  return { rendered, input: screen.getByRole('textbox') as HTMLTextAreaElement };
}

describe('CommandBarShell', () => {
  it('grows to fit multi-line content and shrinks back', async () => {
    const { input } = renderShell();
    Object.defineProperty(input, 'scrollHeight', {
      configurable: true,
      get: () => (input.value.includes('\n') ? 60 : 20),
    });
    fireEvent.change(input, { target: { value: 'first\nsecond' } });
    expect(input.style.height).toBe('60px');
    fireEvent.change(input, { target: { value: 'first' } });
    expect(input.style.height).toBe('20px');
  });

  it('trails the ghost behind the typed text, with the typed prefix hidden', () => {
    const { rendered } = renderShell({ ghost: 'git status' }, 'git');
    // The overlay repeats the typed text so the completion lines up under the real caret, and hides
    // that copy with `visibility` — so its text content is the whole suggestion, prefix included.
    expect(rendered.container.querySelector('.ghost')?.textContent).toBe('git status');
    expect(rendered.container.querySelector('.ghost-typed')?.textContent).toBe('git');
  });

  it('renders no ghost overlay when there is no suggestion', () => {
    const { rendered } = renderShell();
    expect(rendered.container.querySelector('.ghost')).toBeNull();
  });

  it('renders the above slot over the command line', () => {
    const { rendered } = renderShell({ above: <div className="completions">one  two</div> });
    expect(rendered.container.querySelector('.completions')?.textContent).toBe('one  two');
  });

  it('renders the trailing slot at the end of the command line, after the input', () => {
    const { rendered } = renderShell({ trailing: <button type="button">Aa</button> });
    const command = rendered.container.querySelector('.command')!;
    // Inside the line rather than beside it, and last so the shell's own `margin-left: auto` is
    // what pins it right — a caller that has to know the line's layout to place a control on it is
    // the drift the slot exists to prevent.
    expect(command.lastElementChild?.className).toBe('command-trailing');
    expect(command.lastElementChild?.querySelector('button')?.textContent).toBe('Aa');
  });

  it('renders no trailing slot when there is nothing to trail', () => {
    // The agent tab and the conversation composer pass nothing, so the shell has to leave the line
    // exactly as it was for them.
    const { rendered } = renderShell();
    expect(rendered.container.querySelector('.command-trailing')).toBeNull();
  });

  it('renders a label before the prompt glyph', () => {
    const { rendered } = renderShell({ label: 'queue' });
    expect(rendered.container.querySelector('.command')).toHaveTextContent('queue');
  });

  it('marks the dot busy only while busy', () => {
    const idle = renderShell();
    expect(idle.rendered.container.querySelector('.dot')).not.toHaveClass('busy');
    idle.rendered.unmount();
    const busy = renderShell({ busy: true });
    expect(busy.rendered.container.querySelector('.dot')).toHaveClass('busy');
  });

  it('disables the textarea when told to', () => {
    const { input } = renderShell({ disabled: true });
    expect(input).toBeDisabled();
  });

  it('carries the accessible name it is given', () => {
    renderShell({ ariaLabel: 'Message' });
    expect(screen.getByLabelText('Message')).toBeInTheDocument();
  });

  it('focuses the textarea when the command line is clicked', async () => {
    const { rendered, input } = renderShell();
    await userEvent.click(rendered.container.querySelector('.command')!);
    expect(input).toHaveFocus();
  });

  it('hands every key to the owner rather than acting on it', () => {
    const onKeyDown = vi.fn();
    const { input } = renderShell({ onKeyDown });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(onKeyDown).toHaveBeenCalledTimes(2);
  });

  it('publishes no drop target of its own unless it accepts file drops', () => {
    const { rendered } = renderShell();
    const bar = rendered.container.querySelector('[data-command-bar]')!;

    expect(commandBarDropHandle(bar)).toBeUndefined();
  });

  it('accepts a file-navigator drop at its caret and highlights itself while hovered', async () => {
    const { rendered, input } = renderShell({ acceptsFileDrops: true });
    const bar = rendered.container.querySelector('[data-command-bar]')!;
    await userEvent.type(input, 'cat ');
    const handle = commandBarDropHandle(bar);

    act(() => { handle?.setDropHighlighted(true); });
    expect(bar).toHaveClass('drop-target');
    act(() => { handle?.insertAtCaret('src/index.ts'); });

    expect(input).toHaveValue('cat src/index.ts');
    expect(input).toHaveFocus();
    act(() => { handle?.setDropHighlighted(false); });
    expect(bar).not.toHaveClass('drop-target');
  });

  it('withdraws its drop target when it unmounts', () => {
    const { rendered } = renderShell({ acceptsFileDrops: true });
    const bar = rendered.container.querySelector('[data-command-bar]')!;

    rendered.unmount();

    expect(commandBarDropHandle(bar)).toBeUndefined();
  });
});
