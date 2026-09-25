import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { InlineEditInput } from './InlineEditInput';

function setup() {
  const onCommit = vi.fn();
  const onCancel = vi.fn();
  render(<InlineEditInput className="rename" value="draft" onChange={vi.fn()} onCommit={onCommit} onCancel={onCancel} />);
  return { onCommit, onCancel, input: screen.getByRole('textbox') };
}

describe('InlineEditInput', () => {
  it('commits on Enter without letting the key reach whatever takes focus next', () => {
    const { onCommit, onCancel, input } = setup();
    const notPrevented = fireEvent.keyDown(input, { key: 'Enter' });
    expect(notPrevented).toBe(false);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('cancels on Escape', () => {
    const { onCommit, onCancel, input } = setup();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onCommit).not.toHaveBeenCalled();
  });
});
