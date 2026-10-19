import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, within } from '@testing-library/react';
import { isModalOpen } from '../../shared/modal-open';
import { DeleteScriptDialog } from './DeleteScriptDialog';

// The dialog is shown before a runscript is deleted, so it captures the keyboard globally and swallows
// every key and click while it is open, including ones meant for the list behind it.

function dialog(overrides: Partial<React.ComponentProps<typeof DeleteScriptDialog>> = {}) {
  const props = {
    name: 'deploy',
    schedules: 0,
    open: false,
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  };
  const view = render(<DeleteScriptDialog {...props} />);
  const queries = within(view.container);
  return { props, view, button: (label: string) => queries.getByText(label) as HTMLButtonElement };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('DeleteScriptDialog text', () => {
  it('names the runscript it is about to delete', () => {
    expect(dialog().view.getByText('Delete runscript "deploy"?')).toBeInTheDocument();
  });

  it('shows the singular schedule line for one system schedule', () => {
    const { view } = dialog({ schedules: 1 });

    expect(view.getByText('Used by 1 system schedule. It will fire as missing after this.')).toBeInTheDocument();
  });

  it('shows the plural schedule line for two system schedules', () => {
    const { view } = dialog({ schedules: 2 });

    expect(view.getByText('Used by 2 system schedules. They will fire as missing after this.')).toBeInTheDocument();
  });

  it('shows the open editor line when the runscript is open', () => {
    const { view } = dialog({ open: true });

    expect(view.getByText('Open in an editor tab. The tab keeps its text.')).toBeInTheDocument();
  });

  it('leaves out both lines for a runscript with no schedule and no open tab', () => {
    const { view } = dialog({ schedules: 0, open: false });

    expect(view.queryByText('Used by 1 system schedule. It will fire as missing after this.')).toBeNull();
    expect(view.queryByText('Open in an editor tab. The tab keeps its text.')).toBeNull();
  });
});

describe('DeleteScriptDialog buttons', () => {
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
  it('confirms on Y', () => {
    const { props } = dialog();

    fireEvent.keyDown(document, { key: 'y' });

    expect(props.onConfirm).toHaveBeenCalledOnce();
    expect(props.onCancel).not.toHaveBeenCalled();
  });

  it.each(['n', 'N', 'Escape'])('cancels on %s without sending a delete', (key) => {
    const { props } = dialog();

    fireEvent.keyDown(document, { key });

    expect(props.onCancel).toHaveBeenCalledOnce();
    expect(props.onConfirm).not.toHaveBeenCalled();
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
    cancelled.view.unmount();

    const confirmed = dialog();
    fireEvent.keyDown(document, { key: 'ArrowRight' });
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(confirmed.props.onConfirm).toHaveBeenCalledOnce();
    expect(confirmed.props.onCancel).not.toHaveBeenCalled();
  });

  it('swallows a key it has no answer for, and stops it reaching the list behind', () => {
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

  it('takes a key pressed on the list behind', () => {
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
    const { props } = dialog();
    const outside = document.createElement('button');
    document.body.append(outside);

    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    outside.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(behind).not.toHaveBeenCalled();
    expect(props.onConfirm).not.toHaveBeenCalled();
    expect(props.onCancel).not.toHaveBeenCalled();
    outside.remove();
    globalThis.removeEventListener('click', behind);
  });

  it('leaves a click inside the dialog alone', () => {
    const { view } = dialog();
    const inside = view.getByText('Delete runscript "deploy"?');

    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    inside.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
  });
});

describe('the modal signal', () => {
  it('reports an open modal while the confirmation is up, and releases it on unmount', () => {
    const { view } = dialog();
    expect(isModalOpen()).toBe(true);

    view.unmount();
    expect(isModalOpen()).toBe(false);
  });
});
