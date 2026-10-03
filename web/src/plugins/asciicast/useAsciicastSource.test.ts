import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useAsciicastSource, type AsciicastSourceOptions } from './useAsciicastSource';
import { POLL_MS } from './source-reader';

const HEADER = '{"version":3,"term":{"cols":80,"rows":24},"timestamp":1504467315,'
  + '"idle_time_limit":2,"command":"claude","title":"claude"}\n';

// A recording that grows between reads, which is the ordinary case while a session is still running.
// The bodies are text, so a string's length and its UTF-8 byte length agree here and the expected
// `Range` offset can be written as one.
function respondWith(text: string, status = 200) {
  const bytes = new TextEncoder().encode(text);
  return vi.fn(async () => new Response(bytes.buffer as ArrayBuffer, { status }));
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  // eslint-disable-next-line unicorn/prefer-promise-with-resolvers -- the project targets ES2023
  const promise = new Promise<T>((answer) => { resolve = answer; });
  return { promise, resolve };
}

describe('useAsciicastSource', () => {
  const fetchMock = vi.fn();
  // Whether the host says a live tab is still writing this recording, asked only when a poll finds
  // nothing. Answered true unless a case says otherwise, which is the ordinary answer for a session
  // between two prompts.
  const askLive = vi.fn(async () => true);

  const options = (overrides: Partial<AsciicastSourceOptions> = {}): AsciicastSourceOptions => ({
    url: '/open/1?token=t', active: true, liveAtOpen: false, askLive, ...overrides,
  });

  beforeEach(() => {
    fetchMock.mockReset();
    askLive.mockReset();
    askLive.mockResolvedValue(true);
    vi.stubGlobal('fetch', fetchMock);
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('waits for a slow initial fetch before starting tail reads', async () => {
    const initial = deferred<Response>();
    const first = HEADER + '[0, "o", "one"]\n';
    fetchMock.mockReturnValueOnce(initial.promise).mockImplementation(respondWith('[0.5, "o", "two"]\n'));
    const { result } = renderHook(() => useAsciicastSource(options()));
    await act(async () => { await vi.advanceTimersByTimeAsync(POLL_MS * 3); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => { initial.resolve(new Response(first)); });
    expect(result.current.events).toHaveLength(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(POLL_MS); });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1].headers).toEqual({ Range: `bytes=${first.length}-` });
    expect(result.current.events).toHaveLength(2);
  });

  it('keeps one pending poll across hiding and showing the tab', async () => {
    const pending = deferred<Response>();
    const first = HEADER + '[0, "o", "one"]\n';
    const tail = '[0.5, "o", "two"]\n';
    fetchMock.mockImplementationOnce(respondWith(first)).mockReturnValueOnce(pending.promise)
      .mockImplementation(respondWith('', 416));
    const { result, rerender } = renderHook(({ active }) => useAsciicastSource(options({ active })), {
      initialProps: { active: true },
    });
    await waitFor(() => expect(result.current.events).toHaveLength(1));
    await act(async () => { await vi.advanceTimersByTimeAsync(POLL_MS); });
    rerender({ active: false });
    rerender({ active: true });
    await act(async () => { await vi.advanceTimersByTimeAsync(POLL_MS * 2); });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await act(async () => { pending.resolve(new Response(tail)); });
    expect(result.current.events).toHaveLength(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(POLL_MS); });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[2][1].headers).toEqual({ Range: `bytes=${first.length + tail.length}-` });
  });

  it('aborts a replaced source and ignores its late body', async () => {
    const body = deferred<ArrayBuffer>();
    fetchMock.mockResolvedValueOnce({ status: 200, arrayBuffer: () => body.promise })
      .mockImplementationOnce(respondWith(HEADER + '[0, "o", "new"]\n'));
    const { result, rerender } = renderHook(({ url }) => useAsciicastSource(options({ url, active: false })), {
      initialProps: { url: '/open/old' },
    });
    await act(async () => { await Promise.resolve(); });
    const signal = fetchMock.mock.calls[0][1].signal as AbortSignal;
    rerender({ url: '/open/new' });
    await waitFor(() => expect(result.current.events).toHaveLength(1));
    expect(signal.aborted).toBe(true);
    await act(async () => { body.resolve(new TextEncoder().encode(HEADER + '[0, "o", "old"]\n').buffer); });
    expect(result.current.events).toEqual([{ code: 'o', time: 0, data: 'new' }]);
  });

  it('aborts on unmount and never schedules another read from a late response', async () => {
    const pending = deferred<Response>();
    fetchMock.mockReturnValueOnce(pending.promise);
    const { unmount } = renderHook(() => useAsciicastSource(options()));
    const signal = fetchMock.mock.calls[0][1].signal as AbortSignal;
    unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => { pending.resolve(new Response(HEADER)); await vi.advanceTimersByTimeAsync(POLL_MS * 3); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('ignores an old source liveness answer after a URL replacement', async () => {
    const pending = deferred<boolean>();
    askLive.mockReturnValueOnce(pending.promise);
    fetchMock.mockImplementationOnce(respondWith(HEADER)).mockImplementationOnce(respondWith('', 416))
      .mockImplementationOnce(respondWith(HEADER + '[0, "o", "new"]\n'));
    const { result, rerender } = renderHook(({ url }) => useAsciicastSource(options({ url, liveAtOpen: true })), {
      initialProps: { url: '/open/old' },
    });
    await waitFor(() => expect(result.current.header).toBeDefined());
    await act(async () => { await vi.advanceTimersByTimeAsync(POLL_MS); });
    expect(askLive).toHaveBeenCalledTimes(1);
    rerender({ url: '/open/new' });
    await waitFor(() => expect(result.current.events).toHaveLength(1));
    await act(async () => { pending.resolve(false); });
    expect(result.current.live).toBe(true);
    expect(result.current.events).toEqual([{ code: 'o', time: 0, data: 'new' }]);
  });

  it('reads the whole recording first, with no range to ask for', async () => {
    fetchMock.mockImplementationOnce(respondWith(HEADER + '[0, "o", "one"]\n'));
    const { result } = renderHook(() => useAsciicastSource(options()));

    await waitFor(() => expect(result.current.header).toBeDefined());
    expect(fetchMock.mock.calls[0][1]).not.toHaveProperty('headers');
    expect(result.current.header).toMatchObject({ cols: 80, rows: 24 });
    expect(result.current.events).toHaveLength(1);
  });

  it('asks only for the bytes after the last one read, so a long recording is read once', async () => {
    fetchMock.mockImplementationOnce(respondWith(HEADER + '[0, "o", "one"]\n'));
    fetchMock.mockImplementationOnce(respondWith('[0.5, "o", "two"]\n'));
    const { result } = renderHook(() => useAsciicastSource(options()));
    await waitFor(() => expect(result.current.header).toBeDefined());

    await act(async () => { await vi.advanceTimersByTimeAsync(POLL_MS); });
    expect(fetchMock.mock.calls[1][1]).toMatchObject({
      headers: { Range: `bytes=${HEADER.length + '[0, "o", "one"]\n'.length}-` },
    });
    await waitFor(() => expect(result.current.events).toHaveLength(2));
  });

  it('keeps polling a session that has gone quiet, and stays live while the host says it is running', async () => {
    fetchMock.mockImplementationOnce(respondWith(HEADER + '[0, "o", "one"]\n'));
    fetchMock.mockImplementation(respondWith('', 206));
    const { result } = renderHook(() => useAsciicastSource(options({ liveAtOpen: true })));
    await waitFor(() => expect(result.current.header).toBeDefined());
    expect(result.current.live).toBe(true);

    await act(async () => { await vi.advanceTimersByTimeAsync(POLL_MS); });
    await waitFor(() => expect(askLive).toHaveBeenCalled());
    // Silence is not an ending: an agent waiting on the next prompt produces nothing for as long as
    // the user takes to type it, and the recording is still being written throughout.
    expect(result.current.live).toBe(true);
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('stops being live once the host says no tab is writing the recording, and stops asking', async () => {
    fetchMock.mockImplementationOnce(respondWith(HEADER + '[0, "o", "one"]\n'));
    fetchMock.mockImplementation(respondWith('', 206));
    askLive.mockResolvedValue(false);
    const { result } = renderHook(() => useAsciicastSource(options({ liveAtOpen: true })));
    await waitFor(() => expect(result.current.live).toBe(true));

    await act(async () => { await vi.advanceTimersByTimeAsync(POLL_MS); });
    await waitFor(() => expect(result.current.live).toBe(false));

    const asked = askLive.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(POLL_MS * 2); });
    // A session cannot resume writing a recording the host has stopped watching, so the answer is
    // asked for once and then taken as final.
    expect(askLive.mock.calls.length).toBe(asked);
  });

  it('asks nothing when a poll brings bytes, since bytes prove the session is running', async () => {
    fetchMock.mockImplementationOnce(respondWith(HEADER + '[0, "o", "one"]\n'));
    fetchMock.mockImplementationOnce(respondWith('[0.5, "o", "two"]\n'));
    renderHook(() => useAsciicastSource(options({ liveAtOpen: true })));

    await act(async () => { await vi.advanceTimersByTimeAsync(POLL_MS); });
    expect(askLive).not.toHaveBeenCalled();
  });

  it('is not live once the recording carries its own exit event, whatever the host says', async () => {
    fetchMock.mockImplementationOnce(respondWith(HEADER + '[0, "o", "one"]\n'));
    fetchMock.mockImplementationOnce(respondWith('[0.5, "x", "0"]\n'));
    const { result } = renderHook(() => useAsciicastSource(options({ liveAtOpen: true })));
    await waitFor(() => expect(result.current.live).toBe(true));

    await act(async () => { await vi.advanceTimersByTimeAsync(POLL_MS); });
    // The file says the session ended, so there is nothing left to ask anybody.
    await waitFor(() => expect(result.current.exitStatus).toBe(0));
    expect(result.current.live).toBe(false);
    expect(askLive).not.toHaveBeenCalled();
  });

  it('never asks about a recording that was finished when it opened', async () => {
    fetchMock.mockImplementationOnce(respondWith(HEADER + '[0, "o", "one"]\n'));
    fetchMock.mockImplementation(respondWith('', 206));
    const { result } = renderHook(() => useAsciicastSource(options({ liveAtOpen: false })));
    await waitFor(() => expect(result.current.header).toBeDefined());

    await act(async () => { await vi.advanceTimersByTimeAsync(POLL_MS * 2); });
    expect(result.current.live).toBe(false);
    expect(askLive).not.toHaveBeenCalled();
  });

  it('keeps a recording live when the host cannot answer, rather than declaring it finished', async () => {
    fetchMock.mockImplementationOnce(respondWith(HEADER + '[0, "o", "one"]\n'));
    fetchMock.mockImplementation(respondWith('', 206));
    askLive.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useAsciicastSource(options({ liveAtOpen: true })));
    await waitFor(() => expect(result.current.header).toBeDefined());

    await act(async () => { await vi.advanceTimersByTimeAsync(POLL_MS); });
    await waitFor(() => expect(askLive).toHaveBeenCalled());
    // A question that could not be delivered is not an answer, and a session in progress must not be
    // reported finished because of a transport failure.
    expect(result.current.live).toBe(true);
  });

  it('reads a 416 as nothing new rather than as a failure', async () => {
    fetchMock.mockImplementationOnce(respondWith(HEADER + '[0, "o", "one"]\n'));
    fetchMock.mockImplementationOnce(respondWith('', 416));
    const { result } = renderHook(() => useAsciicastSource(options()));
    await waitFor(() => expect(result.current.header).toBeDefined());

    await act(async () => { await vi.advanceTimersByTimeAsync(POLL_MS); });
    expect(result.current.error).toBeUndefined();
    expect(result.current.live).toBe(false);
  });

  it('stops polling while the tab is hidden, and resumes from where it left off when shown', async () => {
    fetchMock.mockImplementation(respondWith(HEADER + '[0, "o", "one"]\n'));
    const { rerender, result } = renderHook(
      ({ active }: { active: boolean }) => useAsciicastSource(options({ active })),
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
    const { result } = renderHook(() => useAsciicastSource(options()));
    await waitFor(() => expect(result.current.error).toBe('the recording could not be read'));
  });

  it('has nothing to say without a served reference', () => {
    const { result } = renderHook(() => useAsciicastSource(options({ url: undefined })));
    expect(result.current).toMatchObject({ header: undefined, events: [], live: false });
  });
});
