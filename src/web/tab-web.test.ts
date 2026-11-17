import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WEB_USAGE } from './command-line.js';
import { runWebInTab } from './tab-web.js';

const mocks = vi.hoisted(() => ({ searchWebInTab: vi.fn() }));

vi.mock('./search/tab-search.js', () => ({ searchWebInTab: mocks.searchWebInTab }));

const managers = {} as never;

describe('runWebInTab', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.searchWebInTab.mockResolvedValue('search results');
  });

  it('passes a search line, its input, and the signal to the search adapter', async () => {
    const controller = new AbortController();
    await expect(runWebInTab(managers, 'janus', 'web search x', controller.signal)).resolves.toBe('search results');
    expect(mocks.searchWebInTab).toHaveBeenCalledOnce();
    expect(mocks.searchWebInTab).toHaveBeenCalledWith(managers, 'janus', 'web search x', controller.signal);
  });

  it('passes undefined as the fourth argument when no signal is given', async () => {
    await runWebInTab(managers, 'janus', 'web search x');
    expect(mocks.searchWebInTab.mock.calls[0]).toEqual([managers, 'janus', 'web search x', undefined]);
  });

  it('dispatches a mixed-case search line', async () => {
    await runWebInTab(managers, 'janus', 'WEB Search x');
    expect(mocks.searchWebInTab).toHaveBeenCalledWith(managers, 'janus', 'WEB Search x', undefined);
  });

  it('dispatches a bare web search so the adapter answers with the search usage line', async () => {
    await runWebInTab(managers, 'janus', 'web search');
    expect(mocks.searchWebInTab).toHaveBeenCalledWith(managers, 'janus', 'web search', undefined);
  });

  it.each(['web', 'web foo', 'web fetch https://example.com'])(
    'resolves %j to both usage lines without calling the adapter',
    async (line) => {
      await expect(runWebInTab(managers, 'janus', line)).resolves.toBe(WEB_USAGE);
      expect(mocks.searchWebInTab).not.toHaveBeenCalled();
    },
  );

  it('propagates a rejection from the adapter unchanged', async () => {
    const abort = new Error('The operation was aborted.');
    mocks.searchWebInTab.mockRejectedValueOnce(abort);
    await expect(runWebInTab(managers, 'janus', 'web search x', AbortSignal.abort())).rejects.toBe(abort);
  });
});
