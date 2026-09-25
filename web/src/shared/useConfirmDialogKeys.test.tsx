import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useConfirmDialogKeys } from './useConfirmDialogKeys';

function Dialog({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  const { dialogRef, selected } = useConfirmDialogKeys(onConfirm, onCancel);
  return <div ref={dialogRef} tabIndex={-1} data-testid="dialog" data-selected={selected} />;
}

function renderDialog() {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(<Dialog onConfirm={onConfirm} onCancel={onCancel} />);
  return { onConfirm, onCancel, dialog: screen.getByTestId('dialog') };
}

describe('useConfirmDialogKeys', () => {
  it('selects Cancel by default', () => {
    const { dialog } = renderDialog();

    expect(dialog).toHaveAttribute('data-selected', 'cancel');
  });

  it('confirms on y and cancels on n', () => {
    const { onConfirm, onCancel } = renderDialog();

    fireEvent.keyDown(document, { key: 'y' });
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();

    fireEvent.keyDown(document, { key: 'n' });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('runs Cancel on Enter while Cancel is selected', () => {
    const { onConfirm, onCancel } = renderDialog();

    fireEvent.keyDown(document, { key: 'Enter' });

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('toggles the selection with the arrow keys so Enter follows it', () => {
    const { onConfirm, onCancel, dialog } = renderDialog();

    fireEvent.keyDown(document, { key: 'ArrowRight' });
    expect(dialog).toHaveAttribute('data-selected', 'confirm');
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(onConfirm).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(document, { key: 'ArrowLeft' });
    expect(dialog).toHaveAttribute('data-selected', 'cancel');
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('cancels on Escape regardless of the selection', () => {
    const { onConfirm, onCancel } = renderDialog();

    fireEvent.keyDown(document, { key: 'ArrowRight' });
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
