import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useCommandHistoryRecall } from './useCommandHistoryRecall';

function renderRecall(history: string[]) {
  const apply = vi.fn();
  const { result } = renderHook(() => useCommandHistoryRecall(history, apply));
  return { apply, result };
}

describe('useCommandHistoryRecall', () => {
  it('does nothing when there is no history to walk', () => {
    const { apply, result } = renderRecall([]);
    act(() => { result.current.recallOlder('draft'); });
    expect(apply).not.toHaveBeenCalled();
  });

  it('walks back from the newest entry and stops at the oldest', () => {
    const { apply, result } = renderRecall(['first', 'second', 'third']);
    act(() => { result.current.recallOlder(''); });
    act(() => { result.current.recallOlder(''); });
    act(() => { result.current.recallOlder(''); });
    act(() => { result.current.recallOlder(''); });
    expect(apply.mock.calls.map(([text]) => text)).toEqual(['third', 'second', 'first', 'first']);
  });

  it('ignores a step forward when the walk has not started', () => {
    const { apply, result } = renderRecall(['first', 'second']);
    act(() => { result.current.recallNewer(); });
    expect(apply).not.toHaveBeenCalled();
  });

  it('steps forward toward the newest entry', () => {
    const { apply, result } = renderRecall(['first', 'second']);
    act(() => { result.current.recallOlder(''); });
    act(() => { result.current.recallOlder(''); });
    act(() => { result.current.recallNewer(); });
    expect(apply.mock.calls.map(([text]) => text)).toEqual(['second', 'first', 'second']);
  });

  it('restores the draft the walk started from once it passes the newest entry', () => {
    const { apply, result } = renderRecall(['first', 'second']);
    act(() => { result.current.recallOlder('work in progress'); });
    act(() => { result.current.recallNewer(); });
    expect(apply).toHaveBeenLastCalledWith('work in progress');
  });

  it('stops walking once the draft is restored, so a further step forward is ignored', () => {
    const { apply, result } = renderRecall(['first']);
    act(() => { result.current.recallOlder('draft'); });
    act(() => { result.current.recallNewer(); });
    act(() => { result.current.recallNewer(); });
    expect(apply).toHaveBeenCalledTimes(2);
  });

  it('reset clears the walk so the next step back starts at the newest entry again', () => {
    const { apply, result } = renderRecall(['first', 'second']);
    act(() => { result.current.recallOlder('old draft'); });
    act(() => { result.current.recallOlder('old draft'); });
    act(() => { result.current.reset(); });
    act(() => { result.current.recallOlder('new draft'); });
    act(() => { result.current.recallNewer(); });
    expect(apply.mock.calls.map(([text]) => text)).toEqual(['second', 'first', 'second', 'new draft']);
  });
});
