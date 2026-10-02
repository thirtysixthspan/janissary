import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useReplaySource, POLL_MS } from './useReplaySource';

const HEADER = '{"version":3,"term":{"cols":80,"rows":24},"timestamp":1504467315,'
  + '"idle_time_limit":2,"command":"claude","title":"claude"}\n';


// A recording that grows between reads, which is the ordinary case while a session is still running.
// The bodies are text, so a string's length and its UTF-8 byte length agree here and the expected
// `Range` offset can be written as one.
function respondWith(text: string, status = 200) {
  const bytes = new TextEncoder().encode(text);
  return vi.fn(async () => new Response(bytes.buffer as ArrayBuffer, { status }));
}

describe('useReplaySource', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => { vi.useRealTimers(); });

  it('reads the whole recording first, with no range to ask for', async () => {
    fetchMock.mockImplementationOnce(respondWith(HEADER + '[0, "o", "one"]\n'));
    const { result } = renderHook(() => useReplaySource('/open/1?token=t', true));

    await waitFor(() => expect(result.current.header).toBeDefined());
    expect(fetchMock.mock.calls[0][1]).not.toHaveProperty('headers');
    expect(result.current.header).toMatchObject({ cols: 80, rows: 24, idleTimeLimit: 2 });
    expect(result.current.events).toHaveLength(1);
    expect(result.current.growing).toBe(true);
  });

  it('asks only for the bytes after the last one read, so a long recording is read once', async () => {
    fetchMock.mockImplementationOnce(respondWith(HEADER + '[0, "o", "one"]\n'));
    fetchMock.mockImplementationOnce(respondWith('[0.5, "o", "two"]\n'));
    const { result } = renderHook(() => useReplaySource('/open/1?token=t', true));
    await waitFor(() => expect(result.current.header).toBeDefined());

    await act(async () => { await vi.advanceTimersByTimeAsync(POLL_MS); });
    expect(fetchMock.mock.calls[1][1]).toMatchObject({
      headers: { Range: `bytes=${HEADER.length + '[0, "o", "one"]\n'.length}-` },
    });
    await waitFor(() => expect(result.current.events).toHaveLength(2));
  });

  it('reports a poll that brings nothing new as not growing, and keeps polling', async () => {
    fetchMock.mockImplementationOnce(respondWith(HEADER + '[0, "o", "one"]\n'));
    fetchMock.mockImplementationOnce(respondWith('', 206));
    const { result } = renderHook(() => useReplaySource('/open/1?token=t', true));
    await waitFor(() => expect(result.current.header).toBeDefined());

    await act(async () => { await vi.advanceTimersByTimeAsync(POLL_MS); });
    await waitFor(() => expect(result.current.growing).toBe(false));
    // A session quiet for minutes and then speaking again is still followed, so the chain continues.
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('reads a 416 as nothing new rather than as a failure', async () => {
    fetchMock.mockImplementationOnce(respondWith(HEADER + '[0, "o", "one"]\n'));
    fetchMock.mockImplementationOnce(respondWith('', 416));
    const { result } = renderHook(() => useReplaySource('/open/1?token=t', true));
    await waitFor(() => expect(result.current.header).toBeDefined());

    await act(async () => { await vi.advanceTimersByTimeAsync(POLL_MS); });
    expect(result.current.error).toBeUndefined();
    expect(result.current.growing).toBe(false);
  });

  it('stops polling while the tab is hidden, and resumes from where it left off when shown', async () => {
    fetchMock.mockImplementation(respondWith(HEADER + '[0, "o", "one"]\n'));
    const { rerender, result } = renderHook(
      ({ active }) => useReplaySource('/open/1?token=t', active),
      { initialProps: { active: false } },
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const first = HEADER.length + '[0, "o", "one"]\n'.length;

    await act(async () => { await vi.advanceTimersByTimeAsync(POLL_MS * 3); });
    expect(fetchMock.mock.calls.length).toBe(1);

    rerender({ active: true });
    await act(async () => { await vi.advanceTimersByTimeAsync(POLL_MS); });
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(1));
    // Showing the tab again resumes the reading rather than starting it over: the offset survived the
    // hide, so the second read asks for what came after the first rather than the whole file again.
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ headers: { Range: `bytes=${first}-` } });
    expect(result.current.header).toBeDefined();
  });

  it('reports a recording it could not read at all, rather than showing an empty player', async () => {
    fetchMock.mockImplementation(async () => { throw new Error('offline'); });
    const { result } = renderHook(() => useReplaySource('/open/1?token=t', true));
    await waitFor(() => expect(result.current.error).toBe('the recording could not be read'));
  });

  it('has nothing to say without a served reference', () => {
    const { result } = renderHook(() => useReplaySource(undefined, true));
    expect(result.current).toMatchObject({ header: undefined, events: [], growing: false });
  });
});