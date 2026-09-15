import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isCaretOnFirstLine, isCaretOnLastLine } from './command-caret-lines';

function textarea(clientWidth: number): HTMLTextAreaElement {
  const element = document.createElement('textarea');
  Object.defineProperty(element, 'clientWidth', { value: clientWidth, configurable: true });
  return element;
}

describe('command caret lines', () => {
  it('treats a single-line value as both the first and the last line', () => {
    expect(isCaretOnFirstLine('git status', 4)).toBe(true);
    expect(isCaretOnLastLine('git status', 4)).toBe(true);
  });

  it('treats an unreadable caret as being on the edge so recall still works', () => {
    expect(isCaretOnFirstLine('line1\nline2', null)).toBe(true);
    expect(isCaretOnLastLine('line1\nline2', undefined)).toBe(true);
  });

  it('puts a caret before the first newline on the first line only', () => {
    expect(isCaretOnFirstLine('line1\nline2', 0)).toBe(true);
    expect(isCaretOnLastLine('line1\nline2', 0)).toBe(false);
  });

  it('counts the position of the newline itself as still on the line it ends', () => {
    expect(isCaretOnFirstLine('line1\nline2', 5)).toBe(true);
    expect(isCaretOnFirstLine('line1\nline2', 6)).toBe(false);
  });

  it('puts a caret after the last newline on the last line only', () => {
    expect(isCaretOnLastLine('line1\nline2', 6)).toBe(true);
    expect(isCaretOnLastLine('line1\nline2', 11)).toBe(true);
    expect(isCaretOnFirstLine('line1\nline2', 11)).toBe(false);
  });

  it('puts a caret on an interior line on neither edge', () => {
    expect(isCaretOnFirstLine('a\nb\nc', 2)).toBe(false);
    expect(isCaretOnLastLine('a\nb\nc', 2)).toBe(false);
  });

  describe('a wrapped explicit line', () => {
    beforeEach(() => {
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({
        measureText: (text: string) => ({ width: text.length * 10 }), font: '',
      }) as unknown as CanvasRenderingContext2D);
    });

    afterEach(() => { vi.restoreAllMocks(); });

    it('is not the first visual row once the leading text on it has wrapped', () => {
      const element = textarea(40);
      expect(isCaretOnFirstLine('a very long first line\nsecond', 10, element)).toBe(false);
    });

    it('is still the first visual row before the leading text wraps', () => {
      const element = textarea(40);
      expect(isCaretOnFirstLine('a very long first line\nsecond', 2, element)).toBe(true);
    });

    it('is not the last visual row once the trailing text on it has wrapped', () => {
      const element = textarea(40);
      expect(isCaretOnLastLine('first\na very long last line', 16, element)).toBe(false);
    });

    it('is still the last visual row before the trailing text wraps', () => {
      const element = textarea(40);
      expect(isCaretOnLastLine('first\na very long last line', 26, element)).toBe(true);
    });

    it('ignores wrapping when no element is given, unchanged from before', () => {
      expect(isCaretOnFirstLine('a very long first line\nsecond', 10)).toBe(true);
      expect(isCaretOnLastLine('first\na very long last line', 16)).toBe(true);
    });
  });
});
