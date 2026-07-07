import { render, act } from '@testing-library/react';
import React from 'react';
import { describe, expect, it } from 'vitest';
import { useTranscriptSearch } from './useTranscriptSearch';

let searchResult: ReturnType<typeof useTranscriptSearch>;

function TestHook({ lines, label }: { lines: { type: string; text: string }[]; label: string }) {
  searchResult = useTranscriptSearch(lines as never, label);
  return null;
}

function getResult() {
  return searchResult;
}

describe('useTranscriptSearch', () => {
  it('starts with search closed and empty status', () => {
    render(React.createElement(TestHook, { lines: [], label: 'tab1' }));
    const r = getResult();
    expect(r.searchOpen).toBe(false);
    expect(r.status).toBe('empty');
    expect(r.pattern).toBe('');
    expect(r.position).toBeNull();
  });

  it('open sets searchOpen and pattern', () => {
    render(React.createElement(TestHook, { lines: [], label: 'tab1' }));
    act(() => { getResult().open('error'); });
    const r = getResult();
    expect(r.searchOpen).toBe(true);
    expect(r.pattern).toBe('error');
  });

  it('finds matches in lines', () => {
    const lines = [{ type: 'output', text: 'hello error world' }, { type: 'output', text: 'another error' }];
    render(React.createElement(TestHook, { lines, label: 'tab1' }));
    act(() => { getResult().open('error'); });
    const r = getResult();
    expect(r.status).toBe('match');
    expect(r.position).toEqual({ current: 2, total: 2 });
  });

  it('returns no-match for a pattern with no hits', () => {
    render(React.createElement(TestHook, { lines: [{ type: 'output', text: 'nothing here' }], label: 'tab1' }));
    act(() => { getResult().open('zzzz'); });
    expect(getResult().status).toBe('no-match');
  });

  it('closes search via close()', () => {
    render(React.createElement(TestHook, { lines: [], label: 'tab1' }));
    act(() => { getResult().open('err'); });
    act(() => { getResult().close(); });
    expect(getResult().searchOpen).toBe(false);
  });

  it('stepOlder and stepNewer navigate matches', () => {
    const lines = [
      { type: 'output', text: 'one fish' },
      { type: 'output', text: 'two fish' },
      { type: 'output', text: 'red fish' },
    ];
    render(React.createElement(TestHook, { lines, label: 'tab1' }));
    act(() => { getResult().open('fish'); });
    expect(getResult().position).toEqual({ current: 3, total: 3 });
    act(() => { getResult().stepOlder(); });
    expect(getResult().position!.current).toBe(2);
    act(() => { getResult().stepNewer(); });
    expect(getResult().position!.current).toBe(3);
  });

  it('closes search when active label changes', () => {
    const { rerender } = render(React.createElement(TestHook, { lines: [], label: 'tab1' }));
    act(() => { getResult().open('err'); });
    rerender(React.createElement(TestHook, { lines: [], label: 'tab2' }));
    expect(getResult().searchOpen).toBe(false);
  });
});
