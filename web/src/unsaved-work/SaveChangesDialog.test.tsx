import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { SaveChangesDialog } from './SaveChangesDialog';
import type { SaveChoice } from './SaveChangesDialog';

describe('SaveChangesDialog', () => {
  it('disables Save through its button and keyboard while pending', () => {
    const onSave = vi.fn();
    const view = render(<SaveChangesDialog saving onSave={onSave} onDiscard={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Save (y)' })).toBeDisabled();
    fireEvent.click(screen.getByText('Save (y)'));
    for (const key of ['y', 'Y', 'Enter']) fireEvent.keyDown(document, { key });
    expect(onSave).not.toHaveBeenCalled();
    view.rerender(<SaveChangesDialog saving={false} onSave={onSave} onDiscard={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.keyDown(document, { key: 'y' });
    expect(onSave).toHaveBeenCalledOnce();
  });

  it('keeps Discard and Cancel available through buttons and keyboard while pending', () => {
    const onDiscard = vi.fn();
    const onCancel = vi.fn();
    render(<SaveChangesDialog saving onSave={vi.fn()} onDiscard={onDiscard} onCancel={onCancel} />);
    fireEvent.click(screen.getByText("Don't Save (n)"));
    fireEvent.keyDown(document, { key: 'n' });
    fireEvent.keyDown(document, { key: 'ArrowRight' });
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(onDiscard).toHaveBeenCalledTimes(3);
    fireEvent.click(screen.getByText('Cancel (Esc)'));
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.keyDown(document, { key: 'ArrowRight' });
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(onCancel).toHaveBeenCalledTimes(3);
  });

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

  it('renders a supplied title instead of the default', () => {
    render(
      <SaveChangesDialog
        title="Do you want to save changes to tab one?"
        onSave={vi.fn()}
        onDiscard={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText('Do you want to save changes to tab one?')).toBeInTheDocument();
    expect(screen.queryByText('Do you want to save changes to this file?')).not.toBeInTheDocument();
  });

  it('renders an empty title rather than falling back to the default', () => {
    const { container } = render(<SaveChangesDialog title="" onSave={vi.fn()} onDiscard={vi.fn()} onCancel={vi.fn()} />);
    expect(container.querySelector('.modal-title')).toBeEmptyDOMElement();
    expect(screen.queryByText('Do you want to save changes to this file?')).not.toBeInTheDocument();
  });

  it('starts a controlled selection on the supplied choice', () => {
    render(
      <SaveChangesDialog selected="discard" onSelect={vi.fn()} onSave={vi.fn()} onDiscard={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: "Don't Save (n)" })).toHaveClass('selected');
    expect(screen.getByRole('button', { name: 'Save (y)' })).not.toHaveClass('selected');
    expect(screen.getByRole('button', { name: 'Cancel (Esc)' })).not.toHaveClass('selected');
  });

  const arrowCases: Array<{ selected: SaveChoice; key: string; expected: SaveChoice }> = [
    { selected: 'save', key: 'ArrowRight', expected: 'discard' },
    { selected: 'save', key: 'ArrowLeft', expected: 'cancel' },
    { selected: 'discard', key: 'ArrowRight', expected: 'cancel' },
    { selected: 'discard', key: 'ArrowLeft', expected: 'save' },
    { selected: 'cancel', key: 'ArrowRight', expected: 'save' },
    { selected: 'cancel', key: 'ArrowLeft', expected: 'discard' },
  ];

  it.each(arrowCases)('reports $expected from $selected on $key', ({ selected, key, expected }) => {
    const onSave = vi.fn();
    const onDiscard = vi.fn();
    const onCancel = vi.fn();
    const onSelect = vi.fn();
    render(
      <SaveChangesDialog
        selected={selected}
        onSelect={onSelect}
        onSave={onSave}
        onDiscard={onDiscard}
        onCancel={onCancel}
      />,
    );
    fireEvent.keyDown(document, { key });
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(expected);
    expect(onSave).not.toHaveBeenCalled();
    expect(onDiscard).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
    const selectedName = selected === 'save' ? 'Save (y)' : selected === 'discard' ? "Don't Save (n)" : 'Cancel (Esc)';
    expect(screen.getByRole('button', { name: selectedName })).toHaveClass('selected');
  });

  it('moves a controlled highlight when the parent feeds back a new selection', () => {
    const properties = { onSelect: vi.fn(), onSave: vi.fn(), onDiscard: vi.fn(), onCancel: vi.fn() };
    const view = render(<SaveChangesDialog selected="save" {...properties} />);
    expect(screen.getByRole('button', { name: 'Save (y)' })).toHaveClass('selected');
    view.rerender(<SaveChangesDialog selected="cancel" {...properties} />);
    expect(screen.getByRole('button', { name: 'Cancel (Esc)' })).toHaveClass('selected');
    expect(screen.getByRole('button', { name: 'Save (y)' })).not.toHaveClass('selected');
  });

  it.each(['save', 'discard', 'cancel'] as const)('runs the controlled "%s" choice on Enter', (selected) => {
    const onSave = vi.fn();
    const onDiscard = vi.fn();
    const onCancel = vi.fn();
    const onSelect = vi.fn();
    render(
      <SaveChangesDialog
        selected={selected}
        onSelect={onSelect}
        onSave={onSave}
        onDiscard={onDiscard}
        onCancel={onCancel}
      />,
    );
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(onSave).toHaveBeenCalledTimes(selected === 'save' ? 1 : 0);
    expect(onDiscard).toHaveBeenCalledTimes(selected === 'discard' ? 1 : 0);
    expect(onCancel).toHaveBeenCalledTimes(selected === 'cancel' ? 1 : 0);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('never reports a selection from the keys or the buttons', async () => {
    const onSave = vi.fn();
    const onDiscard = vi.fn();
    const onCancel = vi.fn();
    const onSelect = vi.fn();
    render(
      <SaveChangesDialog
        selected="save"
        onSelect={onSelect}
        onSave={onSave}
        onDiscard={onDiscard}
        onCancel={onCancel}
      />,
    );
    fireEvent.keyDown(document, { key: 'y' });
    fireEvent.keyDown(document, { key: 'n' });
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.keyDown(document, { key: 'Enter' });
    await userEvent.click(screen.getByRole('button', { name: 'Save (y)' }));
    await userEvent.click(screen.getByRole('button', { name: "Don't Save (n)" }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel (Esc)' }));
    expect(onSave).toHaveBeenCalledTimes(3);
    expect(onDiscard).toHaveBeenCalledTimes(2);
    expect(onCancel).toHaveBeenCalledTimes(2);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('keeps the controlled selection when a different button is clicked', async () => {
    const onSelect = vi.fn();
    const onDiscard = vi.fn();
    render(
      <SaveChangesDialog selected="save" onSelect={onSelect} onSave={vi.fn()} onDiscard={onDiscard} onCancel={vi.fn()} />,
    );
    await userEvent.click(screen.getByRole('button', { name: "Don't Save (n)" }));
    expect(onDiscard).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Save (y)' })).toHaveClass('selected');
    expect(screen.getByRole('button', { name: "Don't Save (n)" })).not.toHaveClass('selected');
  });

  it('keeps the buttons in Save, Don\'t Save, Cancel order', () => {
    render(<SaveChangesDialog onSave={vi.fn()} onDiscard={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getAllByRole('button').map((button) => button.textContent?.trim())).toEqual([
      'Save (y)',
      "Don't Save (n)",
      'Cancel (Esc)',
    ]);
  });

  it('passes a supplied className through and adds none by default', () => {
    const properties = { onSave: vi.fn(), onDiscard: vi.fn(), onCancel: vi.fn() };
    const view = render(<SaveChangesDialog {...properties} />);
    expect(screen.getByRole('alertdialog')).not.toHaveClass('save-walk-dialog');
    view.rerender(<SaveChangesDialog {...properties} className="save-walk-dialog" />);
    expect(screen.getByRole('alertdialog')).toHaveClass('modal', 'save-walk-dialog');
  });

  it('keeps a controlled selection interactive while a save is pending', async () => {
    const onSave = vi.fn();
    const onDiscard = vi.fn();
    const onCancel = vi.fn();
    const onSelect = vi.fn();
    const properties = { selected: 'save' as const, onSelect, onSave, onDiscard, onCancel };
    const view = render(<SaveChangesDialog {...properties} saving />);
    expect(screen.getByRole('button', { name: 'Save (y)' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Save (y)' }));
    fireEvent.keyDown(document, { key: 'y' });
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(onSave).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: "Don't Save (n)" }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onDiscard).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document, { key: 'ArrowRight' });
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('discard');
    view.rerender(<SaveChangesDialog {...properties} saving={false} />);
    fireEvent.keyDown(document, { key: 'y' });
    fireEvent.keyDown(document, { key: 'Enter' });
    await userEvent.click(screen.getByRole('button', { name: 'Save (y)' }));
    expect(onSave).toHaveBeenCalledTimes(3);
  });
});
