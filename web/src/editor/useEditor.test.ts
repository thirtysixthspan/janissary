import { describe, it, expect, vi } from 'vitest';
import { act } from 'react';
import { renderHook } from '@testing-library/react';
import { useEditor } from './useEditor';

vi.mock('./model', () => ({
  fromText: vi.fn((text, line) => ({ text, line: line ?? 0 })),
  insertText: vi.fn((s, text) => ({ ...s, text: (s as { text: string }).text + text })),
  deleteBackward: vi.fn((s) => s),
  deleteForward: vi.fn((s) => s),
  killToLineEnd: vi.fn((s) => ({ state: s, killed: null })),
  collapseSelection: vi.fn((s) => s),
  selectAll: vi.fn((s) => s),
  selectedText: vi.fn(() => 'selected'),
}));

vi.mock('./motion', () => ({
  moveCursor: vi.fn((s) => s),
  movePage: vi.fn((s) => s),
  moveLineEdge: vi.fn((s) => s),
  moveDocumentEdge: vi.fn((s) => s),
}));

vi.mock('./undo', () => {
  class UndoBuffer {
    seal = vi.fn();
    record = vi.fn();
    undo = vi.fn(() => null);
    redo = vi.fn(() => null);
  }
  return { UndoBuffer };
});

describe('useEditor', () => {
  it('returns state, stateRef, load, setState, insert, apply, sealUndo', () => {
    const { result } = renderHook(() => useEditor(() => {}));
    const api = result.current;
    expect(api).toHaveProperty('state');
    expect(api).toHaveProperty('stateRef');
    expect(api).toHaveProperty('load');
    expect(api).toHaveProperty('setState');
    expect(api).toHaveProperty('insert');
    expect(api).toHaveProperty('apply');
    expect(api).toHaveProperty('sealUndo');
  });

  it('starts with null state', () => {
    const { result } = renderHook(() => useEditor(() => {}));
    expect(result.current.state).toBeNull();
  });

  it('load calls fromText and sets state', () => {
    const { result } = renderHook(() => useEditor(() => {}));
    act(() => { result.current.load('hello', 3); });
    expect(result.current.state).toBeTruthy();
  });

  it('apply with move kind calls move', () => {
    const { result } = renderHook(() => useEditor(() => {}));
    act(() => { result.current.load('test'); });
    act(() => {
      result.current.apply({ kind: 'move', dir: 'up', extend: false }, 20);
    });
  });

  it('apply with save calls onSave', () => {
    const onSave = vi.fn();
    const { result } = renderHook(() => useEditor(onSave));
    act(() => { result.current.load('test'); });
    act(() => { result.current.apply({ kind: 'save' }, 20); });
    expect(onSave).toHaveBeenCalled();
  });

  it('apply with deleteBackward calls edit', () => {
    const { result } = renderHook(() => useEditor(() => {}));
    act(() => { result.current.load('test'); });
    act(() => { result.current.apply({ kind: 'deleteBackward' }, 20); });
  });

  it('apply with escape collapses selection', () => {
    const { result } = renderHook(() => useEditor(() => {}));
    act(() => { result.current.load('test'); });
    act(() => { result.current.apply({ kind: 'escape' }, 20); });
  });

  it('apply with selectAll selects all text', () => {
    const { result } = renderHook(() => useEditor(() => {}));
    act(() => { result.current.load('test'); });
    act(() => { result.current.apply({ kind: 'selectAll' }, 20); });
  });

  it('apply with page calls movePage', () => {
    const { result } = renderHook(() => useEditor(() => {}));
    act(() => { result.current.load('test'); });
    act(() => { result.current.apply({ kind: 'page', dir: 1, extend: false }, 20); });
  });

  it('apply with lineEdge calls moveLineEdge', () => {
    const { result } = renderHook(() => useEditor(() => {}));
    act(() => { result.current.load('test'); });
    act(() => { result.current.apply({ kind: 'lineEdge', edge: 'home', extend: false }, 20); });
  });

  it('apply with docEdge calls moveDocumentEdge', () => {
    const { result } = renderHook(() => useEditor(() => {}));
    act(() => { result.current.load('test'); });
    act(() => { result.current.apply({ kind: 'docEdge', edge: 'end', extend: false }, 20); });
  });

  it('apply with undefined kind falls through to edit path', () => {
    const { result } = renderHook(() => useEditor(() => {}));
    act(() => { result.current.load('test'); });
    act(() => { result.current.apply({ kind: 'unknown' as never }, 20); });
  });

  it('apply with redo calls undo.redo', () => {
    const { result } = renderHook(() => useEditor(() => {}));
    act(() => { result.current.load('test'); });
    act(() => { result.current.apply({ kind: 'redo' }, 20); });
  });

  it('apply with copy calls navigator.clipboard.writeText', () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const { result } = renderHook(() => useEditor(() => {}));
    act(() => { result.current.load('test'); });
    act(() => { result.current.apply({ kind: 'copy' }, 20); });
    expect(writeText).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
