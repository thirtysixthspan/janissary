import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyText } from './system-clipboard';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('copyText', () => {
  it('writes the text to the system clipboard', () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    copyText('selected text');
    expect(writeText).toHaveBeenCalledWith('selected text');
  });

  it('writes nothing when there is no text', () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    copyText('');
    expect(writeText).not.toHaveBeenCalled();
  });

  it('does not throw when the browser withholds the clipboard', () => {
    vi.stubGlobal('navigator', {});
    expect(() => copyText('selected text')).not.toThrow();
  });
});
