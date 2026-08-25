import { describe, expect, it } from 'vitest';
import {
  applyOperation, canRedo, clampCrop, emptyEditModel, nudgeRect, outputSize, rectFromDrag,
  redoOperation, undoOperation, type ImageOperation,
} from './edit-model';

const SOURCE = { width: 400, height: 300 };
const ROTATE_RIGHT: ImageOperation = { kind: 'rotate', direction: 'right' };
const FLIP_HORIZONTAL: ImageOperation = { kind: 'flip', axis: 'horizontal' };

function modelOf(...operations: ImageOperation[]) {
  let model = emptyEditModel;
  for (const operation of operations) model = applyOperation(model, operation);
  return model;
}

describe('the operation list and its cursor', () => {
  it('appends at the cursor and leaves the source untouched', () => {
    const model = modelOf(ROTATE_RIGHT);
    expect(model.operations).toEqual([ROTATE_RIGHT]);
    expect(model.cursor).toBe(1);
    expect(emptyEditModel.operations).toEqual([]);
  });

  it('undo and redo step the cursor without mutating the list', () => {
    const model = modelOf(ROTATE_RIGHT, FLIP_HORIZONTAL);

    const back = undoOperation(undoOperation(model));
    expect(back.cursor).toBe(0);
    expect(back.operations).toEqual(model.operations);

    const forward = redoOperation(back);
    expect(forward.cursor).toBe(1);
    expect(forward.operations).toEqual(model.operations);
  });

  it('clamps the cursor at both ends', () => {
    expect(undoOperation(emptyEditModel).cursor).toBe(0);
    const one = modelOf(ROTATE_RIGHT);
    expect(redoOperation(one)).toBe(one);
    expect(canRedo(one)).toBe(false);
  });

  it('discards a pending redo when a new operation is applied after an undo', () => {
    const model = undoOperation(modelOf(ROTATE_RIGHT, FLIP_HORIZONTAL));
    expect(canRedo(model)).toBe(true);

    const next = applyOperation(model, { kind: 'flip', axis: 'vertical' });

    expect(next.operations).toEqual([ROTATE_RIGHT, { kind: 'flip', axis: 'vertical' }]);
    expect(canRedo(next)).toBe(false);
  });
});

describe('outputSize', () => {
  it('is the source size for an empty list', () => {
    expect(outputSize(SOURCE, [])).toEqual(SOURCE);
  });

  it('swaps the axes for a rotate in either direction', () => {
    expect(outputSize(SOURCE, [ROTATE_RIGHT])).toEqual({ width: 300, height: 400 });
    expect(outputSize(SOURCE, [{ kind: 'rotate', direction: 'left' }])).toEqual({ width: 300, height: 400 });
  });

  it('leaves a flip alone and takes a crop at its word', () => {
    expect(outputSize(SOURCE, [FLIP_HORIZONTAL])).toEqual(SOURCE);
    expect(outputSize(SOURCE, [{ kind: 'crop', rect: { x: 10, y: 20, width: 100, height: 50 } }]))
      .toEqual({ width: 100, height: 50 });
  });

  it('folds a rotate-then-crop sequence in order', () => {
    const operations: ImageOperation[] = [
      ROTATE_RIGHT,
      { kind: 'crop', rect: { x: 0, y: 0, width: 120, height: 240 } },
      ROTATE_RIGHT,
    ];
    expect(outputSize(SOURCE, operations)).toEqual({ width: 240, height: 120 });
  });
});

describe('clampCrop', () => {
  it('holds a rectangle inside the image bounds', () => {
    expect(clampCrop({ x: -50, y: -10, width: 1000, height: 1000 }, SOURCE))
      .toEqual({ x: 0, y: 0, width: 400, height: 300 });
  });

  it('never produces a zero or negative dimension', () => {
    expect(clampCrop({ x: 10, y: 10, width: 0, height: 0 }, SOURCE))
      .toEqual({ x: 10, y: 10, width: 1, height: 1 });
    expect(clampCrop({ x: 399, y: 299, width: 500, height: 500 }, SOURCE))
      .toEqual({ x: 399, y: 299, width: 1, height: 1 });
  });

  it('rounds to whole pixels', () => {
    expect(clampCrop({ x: 10.4, y: 20.6, width: 30.5, height: 40.4 }, SOURCE))
      .toEqual({ x: 10, y: 21, width: 31, height: 40 });
  });
});

describe('rectFromDrag and nudgeRect', () => {
  it('describes a drag in either direction as a positive-extent rectangle', () => {
    expect(rectFromDrag({ x: 100, y: 80 }, { x: 40, y: 20 }))
      .toEqual({ x: 40, y: 20, width: 60, height: 60 });
  });

  it('moves only the edges the handle names', () => {
    const rect = { x: 10, y: 10, width: 100, height: 100 };
    expect(nudgeRect(rect, 'e', { x: 200, y: 0 })).toEqual({ x: 10, y: 10, width: 190, height: 100 });
    expect(nudgeRect(rect, 'n', { x: 0, y: 50 })).toEqual({ x: 10, y: 50, width: 100, height: 60 });
    expect(nudgeRect(rect, 'sw', { x: 0, y: 200 })).toEqual({ x: 0, y: 10, width: 110, height: 190 });
  });

  it('comes back positive when a handle is dragged past its opposite side', () => {
    const rect = { x: 10, y: 10, width: 100, height: 100 };
    expect(nudgeRect(rect, 'e', { x: 0, y: 0 })).toEqual({ x: 0, y: 10, width: 10, height: 100 });
  });
});
