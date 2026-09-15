import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { wrapsWithinRow } from './caret-row-width';

let measureText: ReturnType<typeof vi.fn>;

beforeEach(() => {
  measureText = vi.fn().mockReturnValue({ width: 50 });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockImplementation(() => ({ measureText, font: '' }) as unknown as CanvasRenderingContext2D);
});

afterEach(() => { vi.restoreAllMocks(); });

function textarea(clientWidth: number): HTMLTextAreaElement {
  const element = document.createElement('textarea');
  Object.defineProperty(element, 'clientWidth', { value: clientWidth, configurable: true });
  return element;
}

describe('wrapsWithinRow', () => {
  it('reports a wrap when the measured width exceeds the row', () => {
    expect(wrapsWithinRow(textarea(40), 'a long line')).toBe(true);
  });

  it('reports no wrap when the measured width fits the row', () => {
    expect(wrapsWithinRow(textarea(60), 'a short line')).toBe(false);
  });

  it('assumes no wrap when a canvas context is unavailable', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    expect(wrapsWithinRow(textarea(1), 'anything')).toBe(false);
  });
});
