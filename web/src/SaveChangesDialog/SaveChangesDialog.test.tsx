import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { SaveChangesDialog } from './SaveChangesDialog';

describe('SaveChangesDialog', () => {
  it('renders the title and three buttons', () => {
    render(<SaveChangesDialog onSave={vi.fn()} onDiscard={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText('Do you want to save changes to this file?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save (y)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: "Don't Save (n)" })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel (Esc)' })).toBeInTheDocument();
  });

  it('moves focus onto the dialog when it mounts', () => {
    render(<SaveChangesDialog onSave={vi.fn()} onDiscard={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole('alertdialog')).toHaveFocus();
  });

  it('selects Save by default', () => {
    render(<SaveChangesDialog onSave={vi.fn()} onDiscard={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Save (y)' })).toHaveClass('selected');
    expect(screen.getByRole('button', { name: "Don't Save (n)" })).not.toHaveClass('selected');
    expect(screen.getByRole('button', { name: 'Cancel (Esc)' })).not.toHaveClass('selected');
  });

  it('calls onSave when the Save button is clicked', async () => {
    const onSave = vi.fn();
    render(<SaveChangesDialog onSave={onSave} onDiscard={vi.fn()} onCancel={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Save (y)' }));
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('calls onDiscard when the Don\'t Save button is clicked', async () => {
    const onDiscard = vi.fn();
    render(<SaveChangesDialog onSave={vi.fn()} onDiscard={onDiscard} onCancel={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: "Don't Save (n)" }));
    expect(onDiscard).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when the Cancel button is clicked', async () => {
    const onCancel = vi.fn();
    render(<SaveChangesDialog onSave={vi.fn()} onDiscard={vi.fn()} onCancel={onCancel} />);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel (Esc)' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it.each(['y', 'Y'])('saves on "%s" regardless of the current selection', (key) => {
    const onSave = vi.fn();
    const onDiscard = vi.fn();
    const onCancel = vi.fn();
    render(<SaveChangesDialog onSave={onSave} onDiscard={onDiscard} onCancel={onCancel} />);
    fireEvent.keyDown(document, { key });
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onDiscard).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it.each(['n', 'N'])('discards on "%s"', (key) => {
    const onSave = vi.fn();
    const onDiscard = vi.fn();
    const onCancel = vi.fn();
    render(<SaveChangesDialog onSave={onSave} onDiscard={onDiscard} onCancel={onCancel} />);
    fireEvent.keyDown(document, { key });
    expect(onDiscard).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('cancels on Escape', () => {
    const onSave = vi.fn();
    const onDiscard = vi.fn();
    const onCancel = vi.fn();
    render(<SaveChangesDialog onSave={onSave} onDiscard={onDiscard} onCancel={onCancel} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
    expect(onDiscard).not.toHaveBeenCalled();
  });

  it('Enter runs the currently selected option, Save by default', () => {
    const onSave = vi.fn();
    const onDiscard = vi.fn();
    const onCancel = vi.fn();
    render(<SaveChangesDialog onSave={onSave} onDiscard={onDiscard} onCancel={onCancel} />);
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onDiscard).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('Enter runs Discard when that is the currently selected option', () => {
    const onSave = vi.fn();
    const onDiscard = vi.fn();
    const onCancel = vi.fn();
    render(<SaveChangesDialog onSave={onSave} onDiscard={onDiscard} onCancel={onCancel} />);
    fireEvent.keyDown(document, { key: 'ArrowRight' });
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(onDiscard).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('Enter runs Cancel when that is the currently selected option', () => {
    const onSave = vi.fn();
    const onDiscard = vi.fn();
    const onCancel = vi.fn();
    render(<SaveChangesDialog onSave={onSave} onDiscard={onDiscard} onCancel={onCancel} />);
    fireEvent.keyDown(document, { key: 'ArrowLeft' });
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
    expect(onDiscard).not.toHaveBeenCalled();
  });

  it.each([
    { key: 'ArrowRight', expected: 'discard' },
    { key: 'ArrowRight', steps: 2, expected: 'cancel' },
    { key: 'ArrowRight', steps: 3, expected: 'save' },
    { key: 'ArrowLeft', expected: 'cancel' },
    { key: 'ArrowLeft', steps: 2, expected: 'discard' },
  ])('Arrow keys cycle selection', ({ key, steps, expected }) => {
    render(<SaveChangesDialog onSave={vi.fn()} onDiscard={vi.fn()} onCancel={vi.fn()} />);
    const count = steps ?? 1;
    for (let i = 0; i < count; i++) fireEvent.keyDown(document, { key });
    if (expected === 'save') expect(screen.getByRole('button', { name: 'Save (y)' })).toHaveClass('selected');
    else if (expected === 'discard') expect(screen.getByRole('button', { name: "Don't Save (n)" })).toHaveClass('selected');
    else expect(screen.getByRole('button', { name: 'Cancel (Esc)' })).toHaveClass('selected');
  });

  it('swallows every other key without acting', () => {
    const onSave = vi.fn();
    const onDiscard = vi.fn();
    const onCancel = vi.fn();
    render(<SaveChangesDialog onSave={onSave} onDiscard={onDiscard} onCancel={onCancel} />);
    fireEvent.keyDown(document, { key: 'a' });
    fireEvent.keyDown(document, { key: 'Tab' });
    fireEvent.keyDown(document, { key: 'ArrowDown' });
    expect(onSave).not.toHaveBeenCalled();
    expect(onDiscard).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('does nothing on a click outside the dialog', async () => {
    const onSave = vi.fn();
    const onDiscard = vi.fn();
    const onCancel = vi.fn();
    const behind = vi.fn();
    render(
      <div>
        <button onClick={behind}>behind</button>
        <SaveChangesDialog onSave={onSave} onDiscard={onDiscard} onCancel={onCancel} />
      </div>,
    );
    await userEvent.click(screen.getByText('behind'));
    expect(onSave).not.toHaveBeenCalled();
    expect(onDiscard).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
    expect(behind).not.toHaveBeenCalled();
  });

  it('removes its key/click listeners on unmount', () => {
    const onSave = vi.fn();
    const { unmount } = render(<SaveChangesDialog onSave={onSave} onDiscard={vi.fn()} onCancel={vi.fn()} />);
    unmount();
    fireEvent.keyDown(document, { key: 'y' });
    expect(onSave).not.toHaveBeenCalled();
  });
});
