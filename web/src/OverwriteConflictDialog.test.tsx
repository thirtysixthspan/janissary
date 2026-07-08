import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { OverwriteConflictDialog } from './OverwriteConflictDialog';

describe('OverwriteConflictDialog', () => {
  it('renders the title and two buttons', () => {
    render(<OverwriteConflictDialog onSave={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText('This file changed on disk. Overwrite it with your changes?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Overwrite (y)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel (Esc)' })).toBeInTheDocument();
  });

  it('moves focus onto the dialog when it mounts', () => {
    render(<OverwriteConflictDialog onSave={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole('alertdialog')).toHaveFocus();
  });

  it('selects Overwrite by default', () => {
    render(<OverwriteConflictDialog onSave={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Overwrite (y)' })).toHaveClass('selected');
    expect(screen.getByRole('button', { name: 'Cancel (Esc)' })).not.toHaveClass('selected');
  });

  it('calls onSave when the Overwrite button is clicked', async () => {
    const onSave = vi.fn();
    render(<OverwriteConflictDialog onSave={onSave} onCancel={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Overwrite (y)' }));
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when the Cancel button is clicked', async () => {
    const onCancel = vi.fn();
    render(<OverwriteConflictDialog onSave={vi.fn()} onCancel={onCancel} />);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel (Esc)' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it.each(['y', 'Y'])('overwrites on "%s" regardless of the current selection', (key) => {
    const onSave = vi.fn();
    const onCancel = vi.fn();
    render(<OverwriteConflictDialog onSave={onSave} onCancel={onCancel} />);
    fireEvent.keyDown(document, { key });
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('cancels on Escape', () => {
    const onSave = vi.fn();
    const onCancel = vi.fn();
    render(<OverwriteConflictDialog onSave={onSave} onCancel={onCancel} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('Enter runs the currently selected option, Overwrite by default', () => {
    const onSave = vi.fn();
    const onCancel = vi.fn();
    render(<OverwriteConflictDialog onSave={onSave} onCancel={onCancel} />);
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('Arrow keys toggle the selection between Overwrite and Cancel', () => {
    render(<OverwriteConflictDialog onSave={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.keyDown(document, { key: 'ArrowRight' });
    expect(screen.getByRole('button', { name: 'Cancel (Esc)' })).toHaveClass('selected');
    fireEvent.keyDown(document, { key: 'ArrowLeft' });
    expect(screen.getByRole('button', { name: 'Overwrite (y)' })).toHaveClass('selected');
  });

  it('swallows every other key without acting', () => {
    const onSave = vi.fn();
    const onCancel = vi.fn();
    render(<OverwriteConflictDialog onSave={onSave} onCancel={onCancel} />);
    fireEvent.keyDown(document, { key: 'n' });
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(onSave).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('does nothing on a click outside the dialog', async () => {
    const onSave = vi.fn();
    const onCancel = vi.fn();
    const behind = vi.fn();
    render(
      <div>
        <button onClick={behind}>behind</button>
        <OverwriteConflictDialog onSave={onSave} onCancel={onCancel} />
      </div>,
    );
    await userEvent.click(screen.getByText('behind'));
    expect(onSave).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
    expect(behind).not.toHaveBeenCalled();
  });

  it('removes its key/click listeners on unmount', () => {
    const onSave = vi.fn();
    const { unmount } = render(<OverwriteConflictDialog onSave={onSave} onCancel={vi.fn()} />);
    unmount();
    fireEvent.keyDown(document, { key: 'y' });
    expect(onSave).not.toHaveBeenCalled();
  });
});
