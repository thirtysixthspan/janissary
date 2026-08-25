import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flattenToPng, renderOperations } from './edit-render';
import type { ImageOperation } from './edit-model';

const SOURCE = { width: 400, height: 300 };
let context: {
  drawImage: ReturnType<typeof vi.fn>;
  translate: ReturnType<typeof vi.fn>;
  rotate: ReturnType<typeof vi.fn>;
  setTransform: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  context = {
    drawImage: vi.fn(), translate: vi.fn(), rotate: vi.fn(), setTransform: vi.fn(),
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockImplementation(() => context as unknown as CanvasRenderingContext2D);
});

afterEach(() => { vi.restoreAllMocks(); });

function render(...operations: ImageOperation[]) {
  return renderOperations(document.createElement('img'), SOURCE, operations);
}

describe('renderOperations', () => {
  it('draws the source at its own size for an empty list', () => {
    const canvas = render();
    expect(canvas.width).toBe(400);
    expect(canvas.height).toBe(300);
    expect(context.drawImage).toHaveBeenCalledTimes(1);
  });

  it('crops to the rectangle using a source rectangle rather than a transform', () => {
    const canvas = render({ kind: 'crop', rect: { x: 10, y: 20, width: 100, height: 50 } });
    expect(canvas.width).toBe(100);
    expect(canvas.height).toBe(50);
    expect(context.drawImage).toHaveBeenLastCalledWith(
      expect.anything(), 10, 20, 100, 50, 0, 0, 100, 50,
    );
    expect(context.rotate).not.toHaveBeenCalled();
  });

  it.each([
    ['right', Math.PI / 2],
    ['left', -Math.PI / 2],
  ] as const)('rotates %s onto an axis-swapped surface', (direction, radians) => {
    const canvas = render({ kind: 'rotate', direction });
    expect(canvas.width).toBe(300);
    expect(canvas.height).toBe(400);
    expect(context.rotate).toHaveBeenCalledWith(radians);
    expect(context.translate).toHaveBeenCalled();
  });

  it.each([
    ['horizontal', [-1, 0, 0, 1, 400, 0]],
    ['vertical', [1, 0, 0, -1, 0, 300]],
  ] as const)('flips %s without changing the dimensions', (axis, matrix) => {
    const canvas = render({ kind: 'flip', axis });
    expect(canvas.width).toBe(400);
    expect(canvas.height).toBe(300);
    expect(context.setTransform).toHaveBeenCalledWith(...matrix);
  });

  it('replays a list in order, so a rotate after a crop swaps the cropped extents', () => {
    const canvas = render(
      { kind: 'crop', rect: { x: 0, y: 0, width: 120, height: 240 } },
      { kind: 'rotate', direction: 'right' },
    );
    expect(canvas.width).toBe(240);
    expect(canvas.height).toBe(120);
  });

  it('never produces a zero-sized surface', () => {
    const canvas = render({ kind: 'crop', rect: { x: 0, y: 0, width: 0, height: 0 } });
    expect(canvas.width).toBe(1);
    expect(canvas.height).toBe(1);
  });
});

describe('flattenToPng', () => {
  it('asks the canvas for PNG bytes whatever the source format was', () => {
    const toDataURL = vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL')
      .mockReturnValue('data:image/png;base64,AAAA');

    expect(flattenToPng(document.createElement('canvas'))).toBe('data:image/png;base64,AAAA');
    expect(toDataURL).toHaveBeenCalledWith('image/png');
  });
});
