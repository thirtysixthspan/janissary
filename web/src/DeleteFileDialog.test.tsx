import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { DeleteFileDialog } from './DeleteFileDialog';

describe('DeleteFileDialog', () => {
  it('renders the title with the given name and both buttons', () => {
    render(<DeleteFileDialog name="notes.txt" onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText('Delete "notes.txt"?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
  });

  it('selects Cancel by default', () => {
    render(<DeleteFileDialog name="notes.txt" onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole('button', { name: /cancel/i })).toHaveClass('selected');
    expect(screen.getByRole('button', { name: /delete/i })).not.toHaveClass('selected');
  });

  it('calls onConfirm when the Delete button is clicked', async () => {
    const onConfirm = vi.fn();
    render(<DeleteFileDialog name="notes.txt" onConfirm={onConfirm} onCancel={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /delete/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when the Cancel button is clicked', async () => {
    const onCancel = vi.fn();
    render(<DeleteFileDialog name="notes.txt" onConfirm={vi.fn()} onCancel={onCancel} />);
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it.each(['y', 'Y'])('confirms on "%s" regardless of the current selection', (key) => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<DeleteFileDialog name="notes.txt" onConfirm={onConfirm} onCancel={onCancel} />);
    fireEvent.keyDown(document, { key });
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it.each(['n', 'N', 'Escape'])('cancels on "%s"', (key) => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<DeleteFileDialog name="notes.txt" onConfirm={onConfirm} onCancel={onCancel} />);
    fireEvent.keyDown(document, { key });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('Enter runs the currently selected option, Cancel by default', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<DeleteFileDialog name="notes.txt" onConfirm={onConfirm} onCancel={onCancel} />);
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it.each(['ArrowLeft', 'ArrowRight'])('%s moves the selection to Delete, then Enter confirms', (key) => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<DeleteFileDialog name="notes.txt" onConfirm={onConfirm} onCancel={onCancel} />);
    fireEvent.keyDown(document, { key });
    expect(screen.getByRole('button', { name: /delete/i })).toHaveClass('selected');
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('does nothing on a click outside the dialog', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const behind = vi.fn();
    render(
      <div>
        <button onClick={behind}>behind</button>
        <DeleteFileDialog name="notes.txt" onConfirm={onConfirm} onCancel={onCancel} />
      </div>,
    );
    await userEvent.click(screen.getByText('behind'));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
    expect(behind).not.toHaveBeenCalled();
  });
});
