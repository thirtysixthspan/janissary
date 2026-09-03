import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConversationTitle } from './ConversationTitle';

function renderTitle(overrides: { title?: string; deleted?: boolean } = {}) {
  const onRename = vi.fn();
  const rendered = render(
    <ConversationTitle
      title={overrides.title ?? 'First conversation'}
      deleted={overrides.deleted ?? false}
      onRename={onRename}
    />,
  );
  return { onRename, rendered, name: screen.getByText(overrides.title ?? 'First conversation') };
}

function edit(rendered: ReturnType<typeof renderTitle>['rendered']): HTMLInputElement {
  return rendered.container.querySelector('.conversation-title-input') as HTMLInputElement;
}

describe('ConversationTitle', () => {
  it('opens an edit field holding the current title on double-click', () => {
    const { rendered, name } = renderTitle();
    expect(edit(rendered)).toBeNull();
    fireEvent.doubleClick(name);
    expect(edit(rendered)).toHaveValue('First conversation');
  });

  it('commits the new title on Enter', () => {
    const { onRename, rendered, name } = renderTitle();
    fireEvent.doubleClick(name);
    const input = edit(rendered);
    fireEvent.change(input, { target: { value: 'Parser notes' } });
    // The field blurs itself on Enter, and the blur is what commits.
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.blur(input);
    expect(onRename).toHaveBeenCalledWith('Parser notes');
  });

  it('commits on a click away', () => {
    const { onRename, rendered, name } = renderTitle();
    fireEvent.doubleClick(name);
    const input = edit(rendered);
    fireEvent.change(input, { target: { value: 'Parser notes' } });
    fireEvent.blur(input);
    expect(onRename).toHaveBeenCalledWith('Parser notes');
  });

  it('cancels on Escape without renaming, and closes the field', () => {
    const { onRename, rendered, name } = renderTitle();
    fireEvent.doubleClick(name);
    const input = edit(rendered);
    fireEvent.change(input, { target: { value: 'Parser notes' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    fireEvent.blur(input);
    expect(onRename).not.toHaveBeenCalled();
    expect(edit(rendered)).toBeNull();
    expect(screen.getByText('First conversation')).toBeInTheDocument();
  });

  it('changes nothing when the committed name is blank', () => {
    const { onRename, rendered, name } = renderTitle();
    fireEvent.doubleClick(name);
    const input = edit(rendered);
    fireEvent.change(input, { target: { value: ' '.repeat(3) } });
    fireEvent.blur(input);
    expect(onRename).not.toHaveBeenCalled();
  });

  it('changes nothing when the name was left as it was', () => {
    const { onRename, rendered, name } = renderTitle();
    fireEvent.doubleClick(name);
    fireEvent.blur(edit(rendered));
    expect(onRename).not.toHaveBeenCalled();
  });

  // The cap an automatic title already carries, so a rename cannot produce a title the first query
  // could not have.
  it('caps the draft at sixty characters', () => {
    const { onRename, rendered, name } = renderTitle();
    fireEvent.doubleClick(name);
    const input = edit(rendered);
    fireEvent.change(input, { target: { value: 'x'.repeat(80) } });
    fireEvent.blur(input);
    expect(onRename).toHaveBeenCalledWith('x'.repeat(60));
  });

  it('refuses to open the field once the conversation is deleted', () => {
    const { rendered, name } = renderTitle({ deleted: true });
    fireEvent.doubleClick(name);
    expect(edit(rendered)).toBeNull();
  });
});
