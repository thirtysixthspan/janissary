import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { FileNavigatorRow } from '@shared/protocol';
import type { JanusClient } from './ws';
import { useFileNavigatorPaste } from './useFileNavigatorPaste';
import { clearClipboard, getClipboardSnapshot, setClipboard } from './file-navigator-clipboard';

function makeRows(): FileNavigatorRow[] {
  return [
    { path: 'dest', name: 'dest', depth: 0, dir: true, expanded: false },
    { path: 'notes.txt', name: 'notes.txt', depth: 0, dir: false },
  ];
}

describe('useFileNavigatorPaste', () => {
  afterEach(() => {
    clearClipboard();
  });

  it('sends the RPC with the destination the cursor implies', () => {
    setClipboard('copy', ['/other/a.txt']);
    const request = vi.fn().mockResolvedValue({ total: 1, failedPaths: [] });
    const client = { request } as unknown as JanusClient;
    const { result } = renderHook(() => useFileNavigatorPaste(client, 2, '/root'));

    act(() => { result.current.paste(makeRows(), 'dest'); });

    expect(request).toHaveBeenCalledWith({
      method: 'pasteFileNavigatorItems',
      params: { index: 2, sources: ['/other/a.txt'], destinationPath: 'dest', mode: 'copy', policy: undefined },
    });
  });

  it('an empty clipboard sends nothing', () => {
    const request = vi.fn();
    const client = { request } as unknown as JanusClient;
    const { result } = renderHook(() => useFileNavigatorPaste(client, 0, '/root'));

    act(() => { result.current.paste(makeRows(), null); });

    expect(request).not.toHaveBeenCalled();
  });

  it('a conflictPaths reply opens the conflict state instead of reporting success', async () => {
    setClipboard('copy', ['/other/a.txt']);
    const request = vi.fn().mockResolvedValue({ conflictPaths: ['/other/a.txt'] });
    const client = { request } as unknown as JanusClient;
    const { result } = renderHook(() => useFileNavigatorPaste(client, 0, '/root'));

    await act(async () => { result.current.paste(makeRows(), null); await Promise.resolve(); });

    expect(result.current.pendingConflict).not.toBeNull();
  });

  it('retry re-sends with overwrite-all and with skip-conflicts', async () => {
    setClipboard('copy', ['/other/a.txt']);
    const request = vi.fn()
      .mockResolvedValueOnce({ conflictPaths: ['/other/a.txt'] })
      .mockResolvedValue({ total: 1, failedPaths: [] });
    const client = { request } as unknown as JanusClient;
    const { result } = renderHook(() => useFileNavigatorPaste(client, 0, '/root'));
    await act(async () => { result.current.paste(makeRows(), null); await Promise.resolve(); });

    await act(async () => { result.current.confirmOverwrite(); await Promise.resolve(); });
    expect(request).toHaveBeenLastCalledWith({
      method: 'pasteFileNavigatorItems',
      params: { index: 0, sources: ['/other/a.txt'], destinationPath: '', mode: 'copy', policy: 'overwrite-all' },
    });

    request.mockResolvedValueOnce({ conflictPaths: ['/other/a.txt'] });
    await act(async () => { result.current.paste(makeRows(), null); await Promise.resolve(); });
    await act(async () => { result.current.skipConflicts(); await Promise.resolve(); });
    expect(request).toHaveBeenLastCalledWith({
      method: 'pasteFileNavigatorItems',
      params: { index: 0, sources: ['/other/a.txt'], destinationPath: '', mode: 'copy', policy: 'skip-conflicts' },
    });
  });

  it('a successful cut-paste clears the clipboard', async () => {
    setClipboard('cut', ['/other/a.txt']);
    const request = vi.fn().mockResolvedValue({ total: 1, failedPaths: [] });
    const client = { request } as unknown as JanusClient;
    const { result } = renderHook(() => useFileNavigatorPaste(client, 0, '/root'));

    await act(async () => { result.current.paste(makeRows(), null); await Promise.resolve(); });
    expect(getClipboardSnapshot()).toBeNull();
  });

  it('a successful copy-paste leaves the clipboard intact', async () => {
    setClipboard('copy', ['/other/b.txt']);
    const request = vi.fn().mockResolvedValue({ total: 1, failedPaths: [] });
    const client = { request } as unknown as JanusClient;
    const { result } = renderHook(() => useFileNavigatorPaste(client, 0, '/root'));

    await act(async () => { result.current.paste(makeRows(), null); await Promise.resolve(); });
    expect(getClipboardSnapshot()).toEqual({ mode: 'copy', paths: ['/other/b.txt'] });
  });
});
