import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, within } from '@testing-library/react';
import React from 'react';
import { ImageEditToolbar } from './ImageEditToolbar';
import { emptyEditModel, type EditModel, type ImageOperation } from './edit-model';

// Rotate and flip apply the moment they are pressed; crop arms a drag on the canvas and is applied by
// the confirm button, so the user can adjust the rectangle before committing to it. That difference
// is the whole reason the crop pair is conditional, and the buttons that implement it had no test.

function model(operations: ImageOperation[], cursor: number): EditModel {
  return { operations, cursor };
}

const ROTATE_LEFT: ImageOperation = { kind: 'rotate', direction: 'left' };
const ROTATE_RIGHT: ImageOperation = { kind: 'rotate', direction: 'right' };
const FLIP_H: ImageOperation = { kind: 'flip', axis: 'horizontal' };
const FLIP_V: ImageOperation = { kind: 'flip', axis: 'vertical' };

function toolbar(overrides: Partial<React.ComponentProps<typeof ImageEditToolbar>> = {}) {
  const props = {
    cropping: false, canCommit: true, model: emptyEditModel,
    onCrop: vi.fn(), onCommit: vi.fn(), onCancel: vi.fn(), onApply: vi.fn(),
    onUndo: vi.fn(), onRedo: vi.fn(),
    ...overrides,
  };
  // Scoped to this render's own container: two toolbars in one test would otherwise both answer
  // every query.
  const view = render(React.createElement(ImageEditToolbar, props));
  return { props, container: view.container, ...within(view.container), rerender: view.rerender };
}

describe('ImageEditToolbar geometry controls', () => {
  it.each([
    ['Rotate left', ROTATE_LEFT],
    ['Rotate right', ROTATE_RIGHT],
    ['Flip horizontal', FLIP_H],
    ['Flip vertical', FLIP_V],
  ] as const)('applies %s immediately', (label, operation) => {
    const { props, getByText } = toolbar();

    fireEvent.click(getByText(label));

    expect(props.onApply).toHaveBeenCalledWith(operation);
  });

  it('arms a crop rather than applying one, and marks the button while it is armed', () => {
    const { props, getByText, rerender, container } = toolbar();

    fireEvent.click(getByText('Crop'));
    expect(props.onCrop).toHaveBeenCalledOnce();
    expect(props.onApply).not.toHaveBeenCalled();
    expect(getByText('Crop').className).not.toBe('active');

    rerender(React.createElement(ImageEditToolbar, { ...props, cropping: true }));
    expect(within(container).getByText('Crop').className).toBe('active');
  });
});

describe('ImageEditToolbar crop gesture actions', () => {
  it('offers no confirm or cancel until a crop is armed', () => {
    const { queryByText } = toolbar();

    expect(queryByText('Apply crop')).toBeNull();
    expect(queryByText('Cancel crop')).toBeNull();
  });

  it('applies and cancels the armed crop', () => {
    const { props, getByText } = toolbar({ cropping: true });

    fireEvent.click(getByText('Apply crop'));
    expect(props.onCommit).toHaveBeenCalledOnce();

    fireEvent.click(getByText('Cancel crop'));
    expect(props.onCancel).toHaveBeenCalledOnce();
  });

  // A rectangle of no area would commit a crop that changes nothing while looking like a gesture
  // the user completed, so the confirm stays out of reach until there is something to commit.
  it('keeps the confirm out of reach until the rectangle can be committed', () => {
    const { getByText } = toolbar({ cropping: true, canCommit: false });

    expect((getByText('Apply crop') as HTMLButtonElement).disabled).toBe(true);
  });

  it('leaves the cancel reachable even when the crop cannot be committed', () => {
    const { props, getByText } = toolbar({ cropping: true, canCommit: false });

    expect((getByText('Cancel crop') as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(getByText('Cancel crop'));
    expect(props.onCancel).toHaveBeenCalledOnce();
  });
});

describe('ImageEditToolbar history', () => {
  it('keeps undo and redo out of reach on an empty history', () => {
    const { getByText } = toolbar();

    expect((getByText('Undo') as HTMLButtonElement).disabled).toBe(true);
    expect((getByText('Redo') as HTMLButtonElement).disabled).toBe(true);
  });

  it('offers undo once there is something to undo, and redo while the cursor is behind the end', () => {
    const atEnd = toolbar({ model: model([ROTATE_LEFT], 1) });
    expect((atEnd.getByText('Undo') as HTMLButtonElement).disabled).toBe(false);
    expect((atEnd.getByText('Redo') as HTMLButtonElement).disabled).toBe(true);

    // Undoing leaves a pending redo, which appending another operation would discard.
    const undone = toolbar({ model: model([ROTATE_LEFT, ROTATE_RIGHT], 1) });
    expect((undone.getByText('Undo') as HTMLButtonElement).disabled).toBe(false);
    expect((undone.getByText('Redo') as HTMLButtonElement).disabled).toBe(false);
  });

  it('undoes and redoes', () => {
    const { props, getByText } = toolbar({ model: model([ROTATE_LEFT, ROTATE_RIGHT], 1) });

    fireEvent.click(getByText('Undo'));
    expect(props.onUndo).toHaveBeenCalledOnce();

    fireEvent.click(getByText('Redo'));
    expect(props.onRedo).toHaveBeenCalledOnce();
  });

  it('keeps both history controls reachable while a crop is armed', () => {
    const { getByText } = toolbar({ cropping: true, model: model([ROTATE_LEFT, ROTATE_RIGHT], 1) });

    expect((getByText('Undo') as HTMLButtonElement).disabled).toBe(false);
    expect((getByText('Redo') as HTMLButtonElement).disabled).toBe(false);
  });
});
