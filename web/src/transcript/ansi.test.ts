import { describe, it, expect } from 'vitest';
import { hasAnsiCodes, parseAnsi } from './ansi';

const ESC = String.fromCodePoint(27);

describe('hasAnsiCodes', () => {
  it('returns false for plain text', () => {
    expect(hasAnsiCodes('just some text')).toBe(false);
  });

  it('returns true when an SGR code is present', () => {
    expect(hasAnsiCodes(`${ESC}[32mgreen${ESC}[0m`)).toBe(true);
  });

  it('returns true when a non-SGR CSI code is present', () => {
    expect(hasAnsiCodes(`${ESC}[2Aup two lines`)).toBe(true);
  });
});

describe('parseAnsi', () => {
  it('returns a single unstyled segment for plain text', () => {
    expect(parseAnsi('just some text')).toEqual([{ text: 'just some text', className: undefined }]);
  });

  it('applies a standard foreground color', () => {
    expect(parseAnsi(`${ESC}[32mgreen`)).toEqual([{ text: 'green', className: 'ansi-fg-2' }]);
  });

  it('applies a bright foreground color', () => {
    expect(parseAnsi(`${ESC}[91mbright red`)).toEqual([{ text: 'bright red', className: 'ansi-fg-9' }]);
  });

  it('applies a background color', () => {
    expect(parseAnsi(`${ESC}[44mblue bg`)).toEqual([{ text: 'blue bg', className: 'ansi-bg-4' }]);
  });

  it('combines bold and a foreground color into one className', () => {
    expect(parseAnsi(`${ESC}[1m${ESC}[31mbold red`)).toEqual([{ text: 'bold red', className: 'ansi-fg-1 ansi-bold' }]);
  });

  it('applies underline', () => {
    expect(parseAnsi(`${ESC}[4munderlined`)).toEqual([{ text: 'underlined', className: 'ansi-underline' }]);
  });

  it('resets style on code 0', () => {
    expect(parseAnsi(`${ESC}[31mred${ESC}[0mplain`)).toEqual([
      { text: 'red', className: 'ansi-fg-1' },
      { text: 'plain', className: undefined },
    ]);
  });

  it('resets style on a bare escape with no params', () => {
    expect(parseAnsi(`${ESC}[31mred${ESC}[mplain`)).toEqual([
      { text: 'red', className: 'ansi-fg-1' },
      { text: 'plain', className: undefined },
    ]);
  });

  it('turns off bold on code 22 while keeping the foreground color', () => {
    expect(parseAnsi(`${ESC}[1;31mbold${ESC}[22mnormal`)).toEqual([
      { text: 'bold', className: 'ansi-fg-1 ansi-bold' },
      { text: 'normal', className: 'ansi-fg-1' },
    ]);
  });

  it('resets foreground/background independently with 39/49', () => {
    expect(parseAnsi(`${ESC}[31;44mtext${ESC}[39mnofg${ESC}[49mnobg`)).toEqual([
      { text: 'text', className: 'ansi-fg-1 ansi-bg-4' },
      { text: 'nofg', className: 'ansi-bg-4' },
      { text: 'nobg', className: undefined },
    ]);
  });

  it('ignores unsupported SGR codes like 256-color without throwing', () => {
    expect(parseAnsi(`${ESC}[38;5;208morange${ESC}[0m`)).toEqual([{ text: 'orange', className: undefined }]);
  });

  it('drops a non-SGR CSI sequence from the visible text', () => {
    expect(parseAnsi(`before${ESC}[2Aafter`)).toEqual([{ text: 'before', className: undefined }, { text: 'after', className: undefined }]);
  });

  it('handles text with no trailing reset', () => {
    expect(parseAnsi(`${ESC}[32mgreen forever`)).toEqual([{ text: 'green forever', className: 'ansi-fg-2' }]);
  });
});
