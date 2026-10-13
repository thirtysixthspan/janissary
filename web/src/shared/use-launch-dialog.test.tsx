import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useLaunchDialog } from './use-launch-dialog';

function Dialog({
  hadRemembered = false,
  canSubmit = true,
  onCancel,
  onCreate,
}: {
  hadRemembered?: boolean;
  canSubmit?: boolean;
  onCancel: () => void;
  onCreate: () => void;
}) {
  const { dialogRef, submitButtonRef } = useLaunchDialog(
    onCancel,
    onCreate,
    canSubmit,
    hadRemembered,
  );
  return (
    <div ref={dialogRef} tabIndex={-1}>
      <button ref={submitButtonRef}>Create</button>
    </div>
  );
}

function makeCallbacks() {
  return { onCancel: vi.fn(), onCreate: vi.fn() };
}

describe('useLaunchDialog', () => {
  it('calls only the cancel callback on Escape', () => {
    const callbacks = makeCallbacks();
    render(<Dialog {...callbacks} />);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(callbacks.onCancel).toHaveBeenCalledOnce();
    expect(callbacks.onCreate).not.toHaveBeenCalled();
  });

  it('calls the create callback on Enter when submission is allowed', () => {
    const callbacks = makeCallbacks();
    render(<Dialog {...callbacks} />);

    fireEvent.keyDown(document, { key: 'Enter' });

    expect(callbacks.onCreate).toHaveBeenCalledOnce();
  });

  it('does not call create on Enter when submission is disallowed', () => {
    const callbacks = makeCallbacks();
    render(<Dialog {...callbacks} canSubmit={false} />);

    fireEvent.keyDown(document, { key: 'Enter' });

    expect(callbacks.onCreate).not.toHaveBeenCalled();
  });

  it('focuses the submit button on mount when a remembered selection was restored', () => {
    render(<Dialog {...makeCallbacks()} hadRemembered />);

    expect(screen.getByRole('button', { name: 'Create' })).toHaveFocus();
  });

  it('leaves the submit button unfocused when nothing was remembered', () => {
    render(<Dialog {...makeCallbacks()} />);

    expect(screen.getByRole('button', { name: 'Create' })).not.toHaveFocus();
  });

  it('uses the latest callbacks after rerender', () => {
    const first = makeCallbacks();
    const second = makeCallbacks();
    const { rerender } = render(<Dialog {...first} />);

    rerender(<Dialog {...second} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.keyDown(document, { key: 'Enter' });

    expect(first.onCancel).not.toHaveBeenCalled();
    expect(first.onCreate).not.toHaveBeenCalled();
    expect(second.onCancel).toHaveBeenCalledOnce();
    expect(second.onCreate).toHaveBeenCalledOnce();
  });
});
