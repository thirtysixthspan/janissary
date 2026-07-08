import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { UnsavedQuitDialog } from './UnsavedQuitDialog';

describe('UnsavedQuitDialog', () => {
  it('renders the title and both buttons', () => {
    render(<UnsavedQuitDialog onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText('You have unsaved changes. Close anyway?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /close anyway/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
  });

  it('moves focus onto the dialog when it mounts', () => {
    render(<UnsavedQuitDialog onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole('alertdialog')).toHaveFocus();
  });

  it('selects Cancel by default', () => {
    render(<UnsavedQuitDialog onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole('button', { name: /cancel/i })).toHaveClass('selected');
    expect(screen.getByRole('button', { name: /close anyway/i })).not.toHaveClass('selected');
  });

  it('calls onConfirm when the Close anyway button is clicked', async () => {
    const onConfirm = vi.fn();
    render(<UnsavedQuitDialog onConfirm={onConfirm} onCancel={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /close anyway/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when the Cancel button is clicked', async () => {
    const onCancel = vi.fn();
    render(<UnsavedQuitDialog onConfirm={vi.fn()} onCancel={onCancel} />);
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it.each(['y', 'Y'])('confirms on "%s" regardless of the current selection', (key) => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<UnsavedQuitDialog onConfirm={onConfirm} onCancel={onCancel} />);
    fireEvent.keyDown(document, { key });
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it.each(['n', 'N', 'Escape'])('cancels on "%s"', (key) => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<UnsavedQuitDialog onConfirm={onConfirm} onCancel={onCancel} />);
    fireEvent.keyDown(document, { key });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('Enter runs the currently selected option, Cancel by default', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<UnsavedQuitDialog onConfirm={onConfirm} onCancel={onCancel} />);
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it.each(['ArrowLeft', 'ArrowRight'])('%s moves the selection to Close anyway, then Enter confirms', (key) => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<UnsavedQuitDialog onConfirm={onConfirm} onCancel={onCancel} />);
    fireEvent.keyDown(document, { key });
    expect(screen.getByRole('button', { name: /close anyway/i })).toHaveClass('selected');
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('swallows every other key without confirming or cancelling', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<UnsavedQuitDialog onConfirm={onConfirm} onCancel={onCancel} />);
    fireEvent.keyDown(document, { key: 'a' });
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('does nothing on a click outside the dialog', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const behind = vi.fn();
    render(
      <div>
        <button onClick={behind}>behind</button>
        <UnsavedQuitDialog onConfirm={onConfirm} onCancel={onCancel} />
      </div>,
    );
    await userEvent.click(screen.getByText('behind'));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
    expect(behind).not.toHaveBeenCalled();
  });

  it('removes its key/click listeners on unmount', () => {
    const onConfirm = vi.fn();
    const { unmount } = render(<UnsavedQuitDialog onConfirm={onConfirm} onCancel={vi.fn()} />);
    unmount();
    fireEvent.keyDown(document, { key: 'y' });
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
