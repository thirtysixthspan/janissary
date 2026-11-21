import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyText, tryCopyText } from './system-clipboard';
import { captureCopiedText, subscribeClipboardCopies } from './clipboard-captures';

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

  it('publishes the copied text to a clipboard-captures subscriber', () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    const seen: string[] = [];
    const unsubscribe = subscribeClipboardCopies((text) => { seen.push(text); });

    copyText('from the editor');
    expect(seen).toEqual(['from the editor']);

    unsubscribe();
    copyText('after unsubscribe');
    expect(seen).toEqual(['from the editor']);
  });

  it('publishes nothing for an empty copy', () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const seen: string[] = [];
    const unsubscribe = subscribeClipboardCopies((text) => { seen.push(text); });

    copyText('');
    expect(seen).toEqual([]);

    unsubscribe();
  });

  it('gives every subscriber the copy even when one throws', () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    const seen: string[] = [];
    const first = subscribeClipboardCopies(() => { throw new Error('subscriber is broken'); });
    const second = subscribeClipboardCopies((text) => { seen.push(text); });

    expect(() => copyText('still delivered')).not.toThrow();
    expect(seen).toEqual(['still delivered']);

    first();
    second();
  });

  it('leaves a later registration in place when an earlier one unsubscribes', () => {
    const first = subscribeClipboardCopies(() => {});
    const seen: string[] = [];
    const second = subscribeClipboardCopies((text) => { seen.push(text); });

    first();
    captureCopiedText('after the first left');

    expect(seen).toEqual(['after the first left']);
    second();
  });
});

describe('tryCopyText', () => {
  it('resolves true after writing the text to the system clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    await expect(tryCopyText('selected text')).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('selected text');
  });

  it('resolves false without throwing when the browser withholds the clipboard', async () => {
    vi.stubGlobal('navigator', {});
    await expect(tryCopyText('selected text')).resolves.toBe(false);
  });

  it('resolves false when the clipboard refuses the write', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });
    await expect(tryCopyText('selected text')).resolves.toBe(false);
  });

  it('publishes the copied text exactly once on a successful write', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    const seen: string[] = [];
    const unsubscribe = subscribeClipboardCopies((text) => { seen.push(text); });

    await tryCopyText('from the editor');

    expect(seen).toEqual(['from the editor']);
    unsubscribe();
  });

  it('publishes the copied text exactly once even when the clipboard refuses the write', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });
    const seen: string[] = [];
    const unsubscribe = subscribeClipboardCopies((text) => { seen.push(text); });

    await expect(tryCopyText('from the grid')).resolves.toBe(false);

    expect(seen).toEqual(['from the grid']);
    unsubscribe();
  });

  it('resolves false and publishes nothing for an empty copy', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const seen: string[] = [];
    const unsubscribe = subscribeClipboardCopies((text) => { seen.push(text); });

    await expect(tryCopyText('')).resolves.toBe(false);

    expect(writeText).not.toHaveBeenCalled();
    expect(seen).toEqual([]);
    unsubscribe();
  });
});
