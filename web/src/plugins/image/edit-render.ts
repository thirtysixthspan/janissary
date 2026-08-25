import type { ImageOperation, Size } from './edit-model';

// The only module that touches a canvas. Every operation is native canvas work — a `drawImage` onto
// a sized surface, under a transform for rotate and flip and with a source rectangle for crop — so
// nothing here computes pixels by hand and no imaging library is involved. Kept apart from the model
// so a change to how an operation is drawn can never change what the operation means.

function createSurface(size: Size): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(size.width));
  canvas.height = Math.max(1, Math.round(size.height));
  return canvas;
}

function crop(input: HTMLCanvasElement, operation: Extract<ImageOperation, { kind: 'crop' }>): HTMLCanvasElement {
  const { x, y, width, height } = operation.rect;
  const output = createSurface({ width, height });
  output.getContext('2d')?.drawImage(input, x, y, width, height, 0, 0, width, height);
  return output;
}

function rotate(input: HTMLCanvasElement, direction: 'left' | 'right'): HTMLCanvasElement {
  const output = createSurface({ width: input.height, height: input.width });
  const context = output.getContext('2d');
  if (!context) return output;
  if (direction === 'right') {
    context.translate(output.width, 0);
    context.rotate(Math.PI / 2);
  } else {
    context.translate(0, output.height);
    context.rotate(-Math.PI / 2);
  }
  context.drawImage(input, 0, 0);
  return output;
}

function flip(input: HTMLCanvasElement, axis: 'horizontal' | 'vertical'): HTMLCanvasElement {
  const output = createSurface({ width: input.width, height: input.height });
  const context = output.getContext('2d');
  if (!context) return output;
  if (axis === 'horizontal') context.setTransform(-1, 0, 0, 1, output.width, 0);
  else context.setTransform(1, 0, 0, -1, 0, output.height);
  context.drawImage(input, 0, 0);
  return output;
}

function step(input: HTMLCanvasElement, operation: ImageOperation): HTMLCanvasElement {
  switch (operation.kind) {
  case 'crop': { return crop(input, operation); }
  case 'rotate': { return rotate(input, operation.direction); }
  case 'flip': { return flip(input, operation.axis); }
  }
}

// Replay an operation list from the decoded source onto a fresh surface. The source is never
// modified, so stepping the undo cursor and re-rendering is the whole of undo.
export function renderOperations(
  source: CanvasImageSource, size: Size, operations: readonly ImageOperation[],
): HTMLCanvasElement {
  const base = createSurface(size);
  base.getContext('2d')?.drawImage(source, 0, 0, base.width, base.height);
  let current = base;
  for (const operation of operations) current = step(current, operation);
  return current;
}

// Flatten the current state for saving. PNG whatever the source format was: the canvas holds RGBA
// pixels and this is the lossless way out of it.
export function flattenToPng(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL('image/png');
}
