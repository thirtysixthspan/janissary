import { describe, expect, it } from 'vitest';
import { isCaretOnFirstLine, isCaretOnLastLine } from './command-caret-lines';

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
});
