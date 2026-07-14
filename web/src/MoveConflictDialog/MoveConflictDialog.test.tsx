import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { MoveConflictDialog } from './MoveConflictDialog';

describe('MoveConflictDialog', () => {
  it('renders the title with the conflicting name and two buttons', () => {
    render(<MoveConflictDialog name="notes.txt" onOverwrite={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText('"notes.txt" already exists here. Overwrite it?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Overwrite' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel (Esc)' })).toBeInTheDocument();
  });

  it('moves focus onto the dialog when it mounts', () => {
    render(<MoveConflictDialog name="notes.txt" onOverwrite={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole('alertdialog')).toHaveFocus();
  });

  it('selects Cancel by default', () => {
    render(<MoveConflictDialog name="notes.txt" onOverwrite={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Cancel (Esc)' })).toHaveClass('selected');
    expect(screen.getByRole('button', { name: 'Overwrite' })).not.toHaveClass('selected');
  });

  it('calls onOverwrite when the Overwrite button is clicked', async () => {
    const onOverwrite = vi.fn();
    render(<MoveConflictDialog name="notes.txt" onOverwrite={onOverwrite} onCancel={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Overwrite' }));
    expect(onOverwrite).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when the Cancel button is clicked', async () => {
    const onCancel = vi.fn();
    render(<MoveConflictDialog name="notes.txt" onOverwrite={vi.fn()} onCancel={onCancel} />);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel (Esc)' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('cancels on Escape', () => {
    const onOverwrite = vi.fn();
    const onCancel = vi.fn();
    render(<MoveConflictDialog name="notes.txt" onOverwrite={onOverwrite} onCancel={onCancel} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onOverwrite).not.toHaveBeenCalled();
  });

  it('Enter runs the currently selected option, Cancel by default', () => {
    const onOverwrite = vi.fn();
    const onCancel = vi.fn();
    render(<MoveConflictDialog name="notes.txt" onOverwrite={onOverwrite} onCancel={onCancel} />);
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onOverwrite).not.toHaveBeenCalled();
  });

  it('Arrow keys toggle the selection between Overwrite and Cancel', () => {
    render(<MoveConflictDialog name="notes.txt" onOverwrite={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.keyDown(document, { key: 'ArrowLeft' });
    expect(screen.getByRole('button', { name: 'Overwrite' })).toHaveClass('selected');
    fireEvent.keyDown(document, { key: 'ArrowRight' });
    expect(screen.getByRole('button', { name: 'Cancel (Esc)' })).toHaveClass('selected');
  });

  it('swallows every other key without acting', () => {
    const onOverwrite = vi.fn();
    const onCancel = vi.fn();
    render(<MoveConflictDialog name="notes.txt" onOverwrite={onOverwrite} onCancel={onCancel} />);
    fireEvent.keyDown(document, { key: 'a' });
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(onOverwrite).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('does nothing on a click outside the dialog', async () => {
    const onOverwrite = vi.fn();
    const onCancel = vi.fn();
    const behind = vi.fn();
    render(
      <div>
        <button onClick={behind}>behind</button>
        <MoveConflictDialog name="notes.txt" onOverwrite={onOverwrite} onCancel={onCancel} />
      </div>,
    );
    await userEvent.click(screen.getByText('behind'));
    expect(onOverwrite).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
    expect(behind).not.toHaveBeenCalled();
  });

  it('removes its key/click listeners on unmount', () => {
    const onCancel = vi.fn();
    const { unmount } = render(<MoveConflictDialog name="notes.txt" onOverwrite={vi.fn()} onCancel={onCancel} />);
    unmount();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).not.toHaveBeenCalled();
  });
});
