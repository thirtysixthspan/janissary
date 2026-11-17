import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WEB_USAGE } from './command-line.js';
import { runWebInTab } from './tab-web.js';

const mocks = vi.hoisted(() => ({ searchWebInTab: vi.fn(), fetchWebInTab: vi.fn() }));

vi.mock('./search/tab-search.js', () => ({ searchWebInTab: mocks.searchWebInTab }));
vi.mock('./fetch/tab-fetch.js', () => ({ fetchWebInTab: mocks.fetchWebInTab }));

const managers = {} as never;

describe('runWebInTab', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.searchWebInTab.mockResolvedValue('search results');
    mocks.fetchWebInTab.mockResolvedValue('fetched page');
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

  it('passes a fetch line, its input, and the signal to the fetch adapter', async () => {
    const controller = new AbortController();
    await expect(runWebInTab(managers, 'janus', 'web fetch https://example.com', controller.signal)).resolves.toBe('fetched page');
    expect(mocks.fetchWebInTab).toHaveBeenCalledOnce();
    expect(mocks.fetchWebInTab).toHaveBeenCalledWith(managers, 'janus', 'web fetch https://example.com', controller.signal);
    expect(mocks.searchWebInTab).not.toHaveBeenCalled();
  });

  it('passes undefined as the fourth argument to the fetch adapter when no signal is given', async () => {
    await runWebInTab(managers, 'janus', 'web fetch https://example.com');
    expect(mocks.fetchWebInTab.mock.calls[0]).toEqual([managers, 'janus', 'web fetch https://example.com', undefined]);
  });

  it('dispatches a mixed-case fetch line', async () => {
    await runWebInTab(managers, 'janus', 'WEB Fetch x');
    expect(mocks.fetchWebInTab).toHaveBeenCalledWith(managers, 'janus', 'WEB Fetch x', undefined);
  });

  it('dispatches a bare web fetch so the adapter answers with the fetch usage line', async () => {
    await runWebInTab(managers, 'janus', 'web fetch');
    expect(mocks.fetchWebInTab).toHaveBeenCalledWith(managers, 'janus', 'web fetch', undefined);
  });

  it.each(['web', 'web foo'])('resolves %j to both usage lines without calling an adapter', async (line) => {
    await expect(runWebInTab(managers, 'janus', line)).resolves.toBe(WEB_USAGE);
    expect(mocks.searchWebInTab).not.toHaveBeenCalled();
    expect(mocks.fetchWebInTab).not.toHaveBeenCalled();
  });

  it('propagates a rejection from the search adapter unchanged', async () => {
    const abort = new Error('The operation was aborted.');
    mocks.searchWebInTab.mockRejectedValueOnce(abort);
    await expect(runWebInTab(managers, 'janus', 'web search x', AbortSignal.abort())).rejects.toBe(abort);
  });

  it('propagates a rejection from the fetch adapter unchanged', async () => {
    const abort = new Error('The operation was aborted.');
    mocks.fetchWebInTab.mockRejectedValueOnce(abort);
    await expect(runWebInTab(managers, 'janus', 'web fetch https://example.com', AbortSignal.abort())).rejects.toBe(abort);
  });
});
