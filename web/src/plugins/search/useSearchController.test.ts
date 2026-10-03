import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SearchMatch, SearchPayload } from '@shared/plugins/search/shared';
import { useSearchController } from './useSearchController';

function match(overrides: Partial<SearchMatch> = {}): SearchMatch {
  return {
    path: 'src/a.ts', line: 12, above: [], match: 'todo', start: 0, end: 4, below: [],
    ...overrides,
  };
}

function payload(overrides: Partial<SearchPayload> = {}): SearchPayload {
  return {
    query: 'todo', include: '', exclude: '', regex: false, matchCase: false, wholeWord: false,
    state: 'done', message: '', rows: [match()], seed: 0, ...overrides,
  };
}

describe('useSearchController', () => {
  it('seeds history from the opened query and records a newly searched term once', () => {
    const sendIntent = vi.fn();
    const { result } = renderHook(() => useSearchController(payload(), sendIntent));

    act(() => result.current.onQuerySearched('fixme'));

    expect(result.current.history).toEqual(['todo', 'fixme']);
    expect(sendIntent).toHaveBeenCalledWith('search', {
      query: 'fixme', include: '', exclude: '', regex: false, matchCase: false, wholeWord: false,
    });
  });

  it('sends each filter and mode update with the value just entered', () => {
    const sendIntent = vi.fn();
    const { result } = renderHook(() => useSearchController(payload(), sendIntent));

    act(() => result.current.changeInclude('src/**/*.ts'));
    act(() => result.current.changeExclude('generated/**'));
    act(() => result.current.toggle('matchCase'));

    expect(sendIntent.mock.calls.map(([, body]) => body)).toEqual([
      { query: 'todo', include: 'src/**/*.ts', exclude: '', regex: false, matchCase: false, wholeWord: false },
      { query: 'todo', include: 'src/**/*.ts', exclude: 'generated/**', regex: false, matchCase: false, wholeWord: false },
      { query: 'todo', include: 'src/**/*.ts', exclude: 'generated/**', regex: false, matchCase: true, wholeWord: false },
    ]);
    expect(result.current.history).toEqual(['todo']);
  });

  it('adopts a newly seeded query and suppresses the search bar echo', () => {
    const sendIntent = vi.fn();
    const { result, rerender } = renderHook(
      ({ value }) => useSearchController(value, sendIntent),
      { initialProps: { value: payload() } },
    );

    rerender({ value: payload({ query: 'renamed', seed: 1 }) });
    act(() => result.current.onQuerySearched('renamed'));

    expect(result.current.query).toBe('renamed');
    expect(result.current.history).toEqual(['todo', 'renamed']);
    expect(sendIntent).not.toHaveBeenCalled();
  });

  it('opens the chosen result by path and line and ignores a missing index', () => {
    const sendIntent = vi.fn();
    const { result } = renderHook(() => useSearchController(payload({ rows: [match({ line: 38 })] }), sendIntent));

    act(() => result.current.onOpen(0));
    act(() => result.current.onOpen(1));

    expect(sendIntent).toHaveBeenCalledOnce();
    expect(sendIntent).toHaveBeenCalledWith('open', { path: 'src/a.ts', line: 38 });
  });
});
