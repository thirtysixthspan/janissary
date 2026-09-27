import { describe, it, expect, vi, afterEach } from 'vitest';
import { fireEvent, render, within } from '@testing-library/react';
import React from 'react';
import { DeleteScheduleDialog } from './DeleteScheduleDialog';

// The dialog is shown before a schedule's timer is cancelled, so it captures the keyboard globally
// and swallows every key and click while it is open — including ones meant for the tab behind it. A
// regression in that capture is invisible until a user presses Backspace and the row is deleted twice.

function dialog(overrides: Partial<React.ComponentProps<typeof DeleteScheduleDialog>> = {}) {
  const props = { id: 'standup', onConfirm: vi.fn(), onCancel: vi.fn(), ...overrides };
  const view = render(React.createElement(DeleteScheduleDialog, props));
  // Scoped to this render's own container, so a test that opens two dialogs can still address each.
  const queries = within(view.container);
  return { props, view, button: (label: string) => queries.getByText(label) as HTMLButtonElement };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('DeleteScheduleDialog', () => {
  it('names the schedule it is about to delete', () => {
    expect(dialog().view.getByText('Delete schedule "standup"?')).toBeTruthy();
  });

  it('offers both options, with cancel selected by default', () => {
    const { button } = dialog();

    expect(button('Delete').className).toBe('modal-button');
    expect(button('Cancel').className).toBe('modal-button selected');
  });

  it('confirms when Delete is clicked', () => {
    const { props, button } = dialog();

    fireEvent.click(button('Delete'));

    expect(props.onConfirm).toHaveBeenCalledOnce();
    expect(props.onCancel).not.toHaveBeenCalled();
  });

  it('cancels when Cancel is clicked', () => {
    const { props, button } = dialog();

    fireEvent.click(button('Cancel'));

    expect(props.onCancel).toHaveBeenCalledOnce();
    expect(props.onConfirm).not.toHaveBeenCalled();
  });
});

describe('the keyboard it captures', () => {
  it.each([
    ['y', 'onConfirm'],
    ['n', 'onCancel'],
    ['Escape', 'onCancel'],
  ] as const)('answers %s', (key, expected) => {
    const { props } = dialog();

    fireEvent.keyDown(document, { key });

    expect(props[expected]).toHaveBeenCalledOnce();
  });

  it('moves the selection with Left and Right, and marks the button it lands on', () => {
    const { button } = dialog();

    fireEvent.keyDown(document, { key: 'ArrowRight' });
    expect(button('Delete').className).toBe('modal-button selected');
    expect(button('Cancel').className).toBe('modal-button');

    fireEvent.keyDown(document, { key: 'ArrowLeft' });
    expect(button('Cancel').className).toBe('modal-button selected');
  });

  it('runs the selected option on Enter, whichever that is', () => {
    const cancelled = dialog();
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(cancelled.props.onCancel).toHaveBeenCalledOnce();
    expect(cancelled.props.onConfirm).not.toHaveBeenCalled();

    const confirmed = dialog();
    fireEvent.keyDown(document, { key: 'ArrowRight' });
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(confirmed.props.onConfirm).toHaveBeenCalledOnce();
    expect(confirmed.props.onCancel).not.toHaveBeenCalled();
  });

  // The whole point of the capture: nothing reaches the tab behind, so an unrelated key must be
  // swallowed outright rather than passed through.
  it('swallows a key it has no answer for, and stops it reaching the tab behind', () => {
    const behind = vi.fn();
    globalThis.addEventListener('keydown', behind);
    const { props } = dialog();

    const event = new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true });
    globalThis.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(behind).not.toHaveBeenCalled();
    expect(props.onConfirm).not.toHaveBeenCalled();
    expect(props.onCancel).not.toHaveBeenCalled();
    globalThis.removeEventListener('keydown', behind);
  });

  it('takes the keyboard from a key pressed on the tab behind', () => {
    const { props } = dialog();

    fireEvent.keyDown(document.body, { key: 'y' });

    expect(props.onConfirm).toHaveBeenCalledOnce();
  });

  it('releases the keyboard when it unmounts', () => {
    const { props, view } = dialog();
    view.unmount();

    const event = new KeyboardEvent('keydown', { key: 'y', bubbles: true, cancelable: true });
    globalThis.dispatchEvent(event);

    expect(props.onConfirm).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });
});

describe('the clicks it swallows', () => {
  it('swallows a click outside the dialog, so the row behind is not activated', () => {
    const behind = vi.fn();
    globalThis.addEventListener('click', behind);
    dialog();
    const outside = document.createElement('button');
    document.body.append(outside);

    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    outside.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(behind).not.toHaveBeenCalled();
    outside.remove();
    globalThis.removeEventListener('click', behind);
  });

  it('leaves a click inside the dialog alone', () => {
    const { view } = dialog();
    const inside = view.getByText('Delete schedule "standup"?');

    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    inside.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
  });
});
