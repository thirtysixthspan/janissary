import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearClipboard,
  getClipboardSnapshot,
  pendingClipboardMode,
  setClipboard,
  subscribeClipboard,
} from './file-navigator-clipboard';

afterEach(() => {
  clearClipboard();
});

describe('file-navigator-clipboard', () => {
  it('round-trips a set/read/clear cycle', () => {
    expect(getClipboardSnapshot()).toBeNull();
    setClipboard('copy', ['/root/a.txt', '/root/b.txt']);
    expect(getClipboardSnapshot()).toEqual({ mode: 'copy', paths: ['/root/a.txt', '/root/b.txt'] });
    clearClipboard();
    expect(getClipboardSnapshot()).toBeNull();
  });

  it('records the source host for a remote clipboard', () => {
    setClipboard('copy', ['/remote/ws/a.txt'], 'devbox');
    expect(getClipboardSnapshot()).toEqual({ mode: 'copy', paths: ['/remote/ws/a.txt'], host: 'devbox' });
  });

  it('setting with an empty path list is a no-op', () => {
    setClipboard('cut', ['/root/a.txt']);
    setClipboard('copy', []);
    expect(getClipboardSnapshot()).toEqual({ mode: 'cut', paths: ['/root/a.txt'] });
  });

  it('answers the membership query correctly for a navigator rooted elsewhere', () => {
    setClipboard('cut', ['/root/a/b.txt']);
    expect(pendingClipboardMode('/root/a', 'b.txt')).toBe('cut');
    expect(pendingClipboardMode('/other/root', 'b.txt')).toBeNull();
  });

  it('reports the copy mode for a copy-mode clipboard so copied rows are marked too', () => {
    setClipboard('copy', ['/root/a/b.txt']);
    expect(pendingClipboardMode('/root/a', 'b.txt')).toBe('copy');
    expect(pendingClipboardMode('/root/a', 'other.txt')).toBeNull();
  });

  it('subscribers fire on a set or clear', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeClipboard(listener);
    setClipboard('copy', ['/root/a.txt']);
    expect(listener).toHaveBeenCalledTimes(1);
    clearClipboard();
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    setClipboard('copy', ['/root/b.txt']);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('the snapshot is referentially stable when nothing changed', () => {
    setClipboard('copy', ['/root/a.txt']);
    const first = getClipboardSnapshot();
    const second = getClipboardSnapshot();
    expect(first).toBe(second);
  });
});
