import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConversationComposer } from './ConversationComposer';

function renderComposer(overrides: {
  history?: string[];
  streaming?: boolean;
  deleted?: boolean;
  active?: boolean;
} = {}) {
  const onSend = vi.fn();
  const rendered = render(
    <ConversationComposer
      history={overrides.history ?? []}
      streaming={overrides.streaming ?? false}
      deleted={overrides.deleted ?? false}
      active={overrides.active ?? true}
      onSend={onSend}
    />,
  );
  return { onSend, rendered, input: screen.getByLabelText('Message') as HTMLTextAreaElement };
}

describe('ConversationComposer', () => {
  it('sends the trimmed query on Enter and clears the input', () => {
    const { onSend, input } = renderComposer();
    fireEvent.change(input, { target: { value: '  what changed?  ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSend).toHaveBeenCalledWith('what changed?');
    expect(input).toHaveValue('');
  });

  it('inserts a newline on Shift+Enter and sends nothing', () => {
    const { onSend, input } = renderComposer();
    fireEvent.change(input, { target: { value: 'first' } });
    input.setSelectionRange(5, 5);
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    expect(onSend).not.toHaveBeenCalled();
    expect(input.value).toBe('first\n');
  });

  // A second query is refused while one is in flight. Refusing it must not throw the text away —
  // which is why the guard sits ahead of the bar's Enter handling rather than inside the send.
  it('refuses a send while a reply is streaming, keeping the typed text', () => {
    const { onSend, input } = renderComposer({ streaming: true });
    fireEvent.change(input, { target: { value: 'a second question' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSend).not.toHaveBeenCalled();
    expect(input).toHaveValue('a second question');
  });

  it('still allows a newline while a reply is streaming', () => {
    const { input } = renderComposer({ streaming: true });
    fireEvent.change(input, { target: { value: 'draft' } });
    input.setSelectionRange(5, 5);
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    expect(input.value).toBe('draft\n');
  });

  it('recalls the conversation\'s own earlier queries on ArrowUp', () => {
    const { input } = renderComposer({ history: ['first question', 'second question'] });
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(input).toHaveValue('second question');
  });

  it('suggests an earlier query as ghost text', () => {
    const { rendered, input } = renderComposer({ history: ['what changed in the parser?'] });
    fireEvent.change(input, { target: { value: 'what changed' } });
    expect(rendered.container.querySelector('.ghost')?.textContent).toBe('what changed in the parser?');
  });

  it('blinks the dot while a reply is streaming', () => {
    const idle = renderComposer();
    expect(idle.rendered.container.querySelector('.dot')).not.toHaveClass('busy');
    idle.rendered.unmount();
    const busy = renderComposer({ streaming: true });
    expect(busy.rendered.container.querySelector('.dot')).toHaveClass('busy');
  });

  it('disables the input once the conversation is deleted', () => {
    const { input } = renderComposer({ deleted: true });
    expect(input).toBeDisabled();
  });

  // A plugin tab stays mounted while hidden, so a background conversation must not take focus.
  it('takes focus on mount only when its tab is on screen', () => {
    const hidden = renderComposer({ active: false });
    expect(hidden.input).not.toHaveFocus();
    hidden.rendered.unmount();
    const visible = renderComposer({ active: true });
    expect(visible.input).toHaveFocus();
  });
});
