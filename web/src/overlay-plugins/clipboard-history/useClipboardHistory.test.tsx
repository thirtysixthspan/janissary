import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createClipboardHistoryStore } from './store';
import { useClipboardHistory } from './useClipboardHistory';

describe('useClipboardHistory', () => {
  it('subscribes to the instance rows and selection', () => {
    const store = createClipboardHistoryStore();
    const { result, unmount } = renderHook(() => useClipboardHistory(store));
    expect(result.current).toMatchObject({ rows: [], selected: 0 });

    act(() => {
      store.record('first');
      store.record('second');
    });
    expect(result.current.rows.map((row) => row.text)).toEqual(['first', 'second']);
    expect(result.current.selected).toBe(1);

    act(() => store.setSelection(0));
    expect(result.current.selected).toBe(0);

    unmount();
    store.dispose();
  });
});
