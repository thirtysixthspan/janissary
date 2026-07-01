import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { QuitDialog } from './QuitDialog';

describe('QuitDialog', () => {
  it('renders the confirmation title and both buttons', () => {
    render(<QuitDialog onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText('Are you sure you want to quit?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /quit/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
  });

  it('moves focus onto the dialog when it mounts', () => {
    render(<QuitDialog onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole('alertdialog')).toHaveFocus();
  });

  it('selects Cancel by default', () => {
    render(<QuitDialog onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole('button', { name: /cancel/i })).toHaveClass('selected');
    expect(screen.getByRole('button', { name: /quit/i })).not.toHaveClass('selected');
  });

  it('calls onConfirm when the Quit button is clicked', async () => {
    const onConfirm = vi.fn();
    render(<QuitDialog onConfirm={onConfirm} onCancel={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /quit/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when the Cancel button is clicked', async () => {
    const onCancel = vi.fn();
    render(<QuitDialog onConfirm={vi.fn()} onCancel={onCancel} />);
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it.each(['y', 'Y'])('confirms on "%s" regardless of the current selection', (key) => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<QuitDialog onConfirm={onConfirm} onCancel={onCancel} />);
    fireEvent.keyDown(document, { key });
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it.each(['n', 'N', 'Escape'])('cancels on "%s"', (key) => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<QuitDialog onConfirm={onConfirm} onCancel={onCancel} />);
    fireEvent.keyDown(document, { key });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('Enter runs the currently selected option, Cancel by default', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<QuitDialog onConfirm={onConfirm} onCancel={onCancel} />);
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it.each(['ArrowLeft', 'ArrowRight'])('%s moves the selection to Quit, then Enter confirms', (key) => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<QuitDialog onConfirm={onConfirm} onCancel={onCancel} />);
    fireEvent.keyDown(document, { key });
    expect(screen.getByRole('button', { name: /quit/i })).toHaveClass('selected');
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('a second Left/Right moves the selection back to Cancel', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<QuitDialog onConfirm={onConfirm} onCancel={onCancel} />);
    fireEvent.keyDown(document, { key: 'ArrowRight' });
    fireEvent.keyDown(document, { key: 'ArrowLeft' });
    expect(screen.getByRole('button', { name: /cancel/i })).toHaveClass('selected');
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('swallows every other key without confirming or cancelling', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<QuitDialog onConfirm={onConfirm} onCancel={onCancel} />);
    fireEvent.keyDown(document, { key: 'a' });
    fireEvent.keyDown(document, { key: 'Tab' });
    fireEvent.keyDown(document, { key: 'ArrowDown' });
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('does nothing on a click outside the dialog, and stops it reaching anything underneath', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const behind = vi.fn();
    render(
      <div>
        <button onClick={behind}>behind</button>
        <QuitDialog onConfirm={onConfirm} onCancel={onCancel} />
      </div>,
    );
    await userEvent.click(screen.getByText('behind'));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
    expect(behind).not.toHaveBeenCalled();
  });

  it('does nothing on a click on the backdrop itself', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const { container } = render(<QuitDialog onConfirm={onConfirm} onCancel={onCancel} />);
    await userEvent.click(container.querySelector('.modal-backdrop')!);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('does not cancel or confirm on a click inside the dialog that is not a button', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<QuitDialog onConfirm={onConfirm} onCancel={onCancel} />);
    await userEvent.click(screen.getByText('Are you sure you want to quit?'));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('removes its key/click listeners on unmount', () => {
    const onConfirm = vi.fn();
    const { unmount } = render(<QuitDialog onConfirm={onConfirm} onCancel={vi.fn()} />);
    unmount();
    fireEvent.keyDown(document, { key: 'y' });
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
