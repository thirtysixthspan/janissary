import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ConfirmDialog } from './ConfirmDialog';
import { isModalOpen } from './modal-open';

// The keyboard contract had never been tested in either of the two copies this component replaced —
// what their suites covered was the wording and the click paths. Sharing the component is only safe
// to change once something holds its behavior still, so that is what these do.

function dialog() {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  const view = render(
    <ConfirmDialog title="Detach claude on devbox?" confirmLabel="Detach" onConfirm={onConfirm} onCancel={onCancel} />,
  );
  return { onConfirm, onCancel, ...view };
}

const press = (key: string) => { fireEvent.keyDown(globalThis.window, { key }); };

describe('ConfirmDialog', () => {
  it('renders the title and confirm label it was given', () => {
    dialog();
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Detach claude on devbox?');
    expect(screen.getByText('Detach', { selector: '.modal-button' })).toBeInTheDocument();
    expect(screen.getByText('Cancel', { selector: '.modal-button' })).toBeInTheDocument();
  });

  // A keyboard user who opens a dialog has to be able to answer it without reaching for the mouse.
  it('confirms on y and cancels on n', () => {
    const first = dialog();
    press('y');
    expect(first.onConfirm).toHaveBeenCalledOnce();
    first.unmount();

    const second = dialog();
    press('n');
    expect(second.onCancel).toHaveBeenCalledOnce();
  });

  it('cancels on Escape', () => {
    const { onCancel, onConfirm } = dialog();
    press('Escape');
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  // Cancel is selected first, so a reflexive Enter on a destructive question does nothing.
  it('takes the cancel button on Enter before anything is selected', () => {
    const { onCancel, onConfirm } = dialog();
    expect(screen.getByText('Cancel', { selector: '.modal-button' })).toHaveClass('selected');
    press('Enter');
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('moves the selection with the arrow keys, and Enter takes what is selected', () => {
    const { onConfirm } = dialog();
    press('ArrowLeft');
    expect(screen.getByText('Detach', { selector: '.modal-button' })).toHaveClass('selected');
    press('Enter');
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('toggles back with a second arrow press', () => {
    const { onCancel } = dialog();
    press('ArrowRight');
    press('ArrowRight');
    expect(screen.getByText('Cancel', { selector: '.modal-button' })).toHaveClass('selected');
    press('Enter');
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('focuses itself on mount so the question has the keyboard', () => {
    dialog();
    expect(document.activeElement).toBe(screen.getByRole('alertdialog'));
  });

  // The listener is on `globalThis` in the capture phase and swallows every key while open, so a
  // dialog that failed to remove it would go on eating keystrokes for the life of the page.
  it('stops answering keys once it has unmounted', () => {
    const { onCancel, unmount } = dialog();
    unmount();
    press('Escape');
    expect(onCancel).not.toHaveBeenCalled();
  });

  // Window-level shortcuts such as Cmd+W run ahead of this listener, so they ask the modal signal.
  it('registers as an open modal while mounted and releases it on unmount', () => {
    const { unmount } = dialog();
    expect(isModalOpen()).toBe(true);
    unmount();
    expect(isModalOpen()).toBe(false);
  });
});
