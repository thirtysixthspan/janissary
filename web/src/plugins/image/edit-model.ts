export type Size = { width: number; height: number };
export type CropRect = { x: number; y: number; width: number; height: number };

export type ImageOperation =
  | { kind: 'crop'; rect: CropRect }
  | { kind: 'rotate'; direction: 'left' | 'right' }
  | { kind: 'flip'; axis: 'horizontal' | 'vertical' };

// An ordered operation list plus the undo cursor into it. Nothing is baked into pixels here: the
// canvas is rendered by replaying `operations.slice(0, cursor)` from the decoded source every time,
// which is what makes undo and redo a cursor move rather than a snapshot stack.
export type EditModel = {
  operations: readonly ImageOperation[];
  cursor: number;
};

export const emptyEditModel: EditModel = { operations: [], cursor: 0 };

// Appending truncates at the cursor, discarding a pending redo — the ordinary stack behavior.
export function applyOperation(model: EditModel, operation: ImageOperation): EditModel {
  const operations = [...model.operations.slice(0, model.cursor), operation];
  return { operations, cursor: operations.length };
}

export function undoOperation(model: EditModel): EditModel {
  return model.cursor === 0 ? model : { ...model, cursor: model.cursor - 1 };
}

export function redoOperation(model: EditModel): EditModel {
  return model.cursor >= model.operations.length ? model : { ...model, cursor: model.cursor + 1 };
}

export function activeOperations(model: EditModel): readonly ImageOperation[] {
  return model.operations.slice(0, model.cursor);
}

export function isEdited(model: EditModel): boolean {
  return model.cursor > 0;
}

export function canRedo(model: EditModel): boolean {
  return model.cursor < model.operations.length;
}

// The dimensions a list produces from a given source size — arithmetic, not rendering, so the
// readout above the canvas and the tests below it never need a drawing surface.
export function outputSize(source: Size, operations: readonly ImageOperation[]): Size {
  let size = source;
  for (const operation of operations) {
    switch (operation.kind) {
    case 'crop': { size = { width: operation.rect.width, height: operation.rect.height }; break; }
    case 'rotate': { size = { width: size.height, height: size.width }; break; }
    case 'flip': { break; }
    }
  }
  return size;
}

// Hold a dragged rectangle inside the image and never let it collapse: a released pointer that
// crossed an edge, or never moved at all, still describes at least one pixel.
export function clampCrop(rect: CropRect, bounds: Size): CropRect {
  const left = Math.max(0, Math.min(Math.round(rect.x), bounds.width - 1));
  const top = Math.max(0, Math.min(Math.round(rect.y), bounds.height - 1));
  return {
    x: left,
    y: top,
    width: Math.max(1, Math.min(Math.round(rect.width), bounds.width - left)),
    height: Math.max(1, Math.min(Math.round(rect.height), bounds.height - top)),
  };
}

// The eight grips around a drawn crop rectangle, named for the edge or corner each one moves.
export type CropHandle = 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se';

// Move one edge or corner of `rect` to `point`, leaving the opposite side where it is. The result is
// still expressed as a drag between two corners, so a handle dragged past its opposite side simply
// turns the rectangle inside out and comes back positive.
export function nudgeRect(
  rect: CropRect, handle: CropHandle, point: { x: number; y: number },
): CropRect {
  const left = (handle.includes('w') ? point : rect).x;
  const right = handle.includes('e') ? point.x : rect.x + rect.width;
  const top = (handle.includes('n') ? point : rect).y;
  const bottom = handle.includes('s') ? point.y : rect.y + rect.height;
  return rectFromDrag({ x: left, y: top }, { x: right, y: bottom });
}

// A drag between two corners, in either direction, as a positive-extent rectangle.
export function rectFromDrag(from: { x: number; y: number }, to: { x: number; y: number }): CropRect {
  return {
    x: Math.min(from.x, to.x),
    y: Math.min(from.y, to.y),
    width: Math.abs(to.x - from.x),
    height: Math.abs(to.y - from.y),
  };
}
