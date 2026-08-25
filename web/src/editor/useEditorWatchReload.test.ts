import { describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { JanusClient } from '../ws';
import { fromText } from './model';
import type { EditorApi } from './useEditor';
import { useEditorWatchReload } from './useEditorWatchReload';

function makeApi(text = 'line one\nline two', line = 0): EditorApi {
  const stateRef: EditorApi['stateRef'] = { current: fromText(text, line) };
  return {
    get state() { return stateRef.current; },
    stateRef,
    load: vi.fn((next: string, at?: number) => { stateRef.current = fromText(next, at); }),
    setState: vi.fn(),
    insert: vi.fn(),
    apply: vi.fn(),
    sealUndo: vi.fn(),
  } as unknown as EditorApi;
}

function makeClient(readFile = vi.fn().mockResolvedValue('changed elsewhere')) {
  return { client: { readFile } as unknown as JanusClient, readFile };
}

function renderWatch(mtimeMs: number | undefined, dirty: boolean, api: EditorApi, client: JanusClient) {
  const conflictPendingRef = { current: false };
  const setLastSaved = vi.fn();
  const view = renderHook(
    ({ m }: { m: number | undefined }) =>
      useEditorWatchReload(m, dirty, conflictPendingRef, api, setLastSaved, client, '/open/1'),
    { initialProps: { m: mtimeMs } },
  );
  return { ...view, conflictPendingRef, setLastSaved };
}

describe('useEditorWatchReload', () => {
  it('reloads a clean buffer through the client when the file changes on disk', async () => {
    const { client, readFile } = makeClient();
    const api = makeApi();
    const { rerender, setLastSaved } = renderWatch(1, false, api, client);

    rerender({ m: 2 });

    await waitFor(() => expect(api.load).toHaveBeenCalledWith('changed elsewhere', 0));
    expect(readFile).toHaveBeenCalledWith('/open/1');
    expect(setLastSaved).toHaveBeenCalledWith('changed elsewhere');
  });

  it('keeps the cursor on the line it was on before the reload', async () => {
    const { client } = makeClient();
    const api = makeApi('line one\nline two\nline three', 2);
    const { rerender } = renderWatch(1, false, api, client);

    rerender({ m: 2 });

    await waitFor(() => expect(api.load).toHaveBeenCalledWith('changed elsewhere', 2));
  });

  it('does not reload a dirty buffer, remembering the conflict for the next save instead', async () => {
    const { client, readFile } = makeClient();
    const api = makeApi();
    const { rerender, conflictPendingRef } = renderWatch(1, true, api, client);

    rerender({ m: 2 });

    await act(async () => { await Promise.resolve(); });
    expect(conflictPendingRef.current).toBe(true);
    expect(readFile).not.toHaveBeenCalled();
    expect(api.load).not.toHaveBeenCalled();
  });

  it('ignores a rerender that does not change the mtime', async () => {
    const { client, readFile } = makeClient();
    const { rerender } = renderWatch(1, false, makeApi(), client);

    rerender({ m: 1 });

    await act(async () => { await Promise.resolve(); });
    expect(readFile).not.toHaveBeenCalled();
  });

  it('does nothing while the file has no mtime to watch', async () => {
    const { client, readFile } = makeClient();
    renderWatch(undefined, false, makeApi(), client);

    await act(async () => { await Promise.resolve(); });
    expect(readFile).not.toHaveBeenCalled();
  });

  it('reloads on the first mtime a freshly-opened tab ever sees', async () => {
    const { client, readFile } = makeClient();
    const { rerender } = renderWatch(undefined, false, makeApi(), client);

    rerender({ m: 1 });

    await waitFor(() => expect(readFile).toHaveBeenCalledWith('/open/1'));
  });

  it('leaves the buffer alone when the reload fails — it is best effort', async () => {
    const { client } = makeClient(vi.fn().mockRejectedValue(new Error('HTTP 500')));
    const api = makeApi();
    const { rerender, setLastSaved } = renderWatch(1, false, api, client);

    rerender({ m: 2 });

    await act(async () => { await Promise.resolve(); });
    expect(api.load).not.toHaveBeenCalled();
    expect(setLastSaved).not.toHaveBeenCalled();
  });
});
