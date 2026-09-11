import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { copySelectionToClipboards } from './file-navigator-copy';
import { clearClipboard, getClipboardSnapshot, setClipboard } from './file-navigator-clipboard';

// jsdom implements no async clipboard, so `navigator` is stood up with just the one method
// `copyText` reaches for.
function stubSystemClipboard() {
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('navigator', { clipboard: { writeText } });
  return writeText;
}

let writeText: ReturnType<typeof stubSystemClipboard>;

beforeEach(() => {
  writeText = stubSystemClipboard();
});

afterEach(() => {
  vi.unstubAllGlobals();
  clearClipboard();
});

describe('copySelectionToClipboards', () => {
  it('arms the file clipboard with the absolute paths in copy mode', () => {
    copySelectionToClipboards('/work', ['a.ts', 'src/b.ts']);
    expect(getClipboardSnapshot()).toEqual({ mode: 'copy', paths: ['/work/a.ts', '/work/src/b.ts'] });
  });

  it('writes the same rows to the system clipboard as newline-separated tree-relative paths', () => {
    copySelectionToClipboards('/work', ['a.ts', 'src/b.ts']);
    expect(writeText).toHaveBeenCalledWith('a.ts\nsrc/b.ts');
  });

  it('writes host-qualified absolute paths for a remote tree', () => {
    copySelectionToClipboards('/remote/ws', ['a.ts'], 'devbox');
    expect(getClipboardSnapshot()).toEqual({
      mode: 'copy', paths: ['/remote/ws/a.ts'], host: 'devbox',
    });
    expect(writeText).toHaveBeenCalledWith('devbox:/remote/ws/a.ts');
  });

  it('touches neither clipboard when nothing is selected', () => {
    setClipboard('cut', ['/work/kept.ts']);
    copySelectionToClipboards('/work', []);
    expect(getClipboardSnapshot()).toEqual({ mode: 'cut', paths: ['/work/kept.ts'] });
    expect(writeText).not.toHaveBeenCalled();
  });
});
