import { describe, it, expect } from 'vitest';
import { osc52ClipboardText } from './terminal-osc52';

function payload(text: string): string {
  const bytes = new TextEncoder().encode(text);
  return btoa(String.fromCodePoint(...bytes));
}

describe('osc52ClipboardText', () => {
  it('decodes the base64 payload a harness asks to be copied', () => {
    expect(osc52ClipboardText(`c;${payload('copied from a remote harness')}`))
      .toBe('copied from a remote harness');
  });

  it('decodes a payload as UTF-8 rather than one character per byte', () => {
    expect(osc52ClipboardText(`c;${payload('naïve — 日本語')}`)).toBe('naïve — 日本語');
  });

  it('accepts a selection other than the clipboard', () => {
    expect(osc52ClipboardText(`p;${payload('primary selection')}`)).toBe('primary selection');
  });

  it('accepts an empty selection, which means the default', () => {
    expect(osc52ClipboardText(`;${payload('default selection')}`)).toBe('default selection');
  });

  it('returns null for a read request rather than disclosing the clipboard', () => {
    expect(osc52ClipboardText('c;?')).toBeNull();
  });

  it('returns null for an empty payload', () => {
    expect(osc52ClipboardText('c;')).toBeNull();
  });

  it('returns null for data carrying no selection separator', () => {
    expect(osc52ClipboardText('nonsense')).toBeNull();
  });

  it('returns null for a payload that is not valid base64', () => {
    expect(osc52ClipboardText('c;not base64!!')).toBeNull();
  });
});
