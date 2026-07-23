import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { EditorState } from './model';
import type { EditorApi } from './useEditor';
import { useEditorMouse } from './useEditorMouse';

function makeState(lines: string[]): EditorState {
  return { lines, cursor: { line: 0, col: 0 }, anchor: null };
}

function makeApi(state: EditorState | null): EditorApi {
  const stateRef = { current: state };
  return {
    state,
    stateRef: stateRef as React.RefObject<EditorState | null>,
    load: vi.fn(),
    setState: vi.fn((s: EditorState) => { stateRef.current = s; }),
    insert: vi.fn(),
    apply: vi.fn(),
    sealUndo: vi.fn(),
  };
}

function makeEditorBody(lineCount: number): HTMLDivElement {
  const body = document.createElement('div');
  for (let i = 0; i < lineCount; i++) {
    const row = document.createElement('div');
    row.dataset.editorLine = String(i);
    const gutter = document.createElement('span');
    gutter.className = 'editor-gutter';
    row.append(gutter);
    const content = document.createElement('span');
    content.className = 'editor-content';
    content.append(document.createTextNode(`line ${i}`));
    row.append(content);
    body.append(row);
  }
  document.body.append(body);
  return body;
}

describe('useEditorMouse', () => {
  beforeEach(() => {
    document.elementFromPoint = vi.fn().mockReturnValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prevents default when no state', () => {
    const api = makeApi(null);
    const bodyRef = { current: document.createElement('div') } as React.RefObject<HTMLDivElement | null>;
    const focus = vi.fn();
    const { result } = renderHook(() => useEditorMouse(api, bodyRef, focus));

    const event = { preventDefault: vi.fn(), target: document.createElement('div'), clientX: 0, clientY: 0, detail: 1, shiftKey: false } as unknown as React.MouseEvent;
    act(() => { result.current.onMouseDown(event); });
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it('places caret on single click in content', () => {
    const state = makeState(['hello', 'world']);
    const api = makeApi(state);
    const body = makeEditorBody(2);
    const bodyRef = { current: body } as React.RefObject<HTMLDivElement | null>;
    const focus = vi.fn();
    const { result } = renderHook(() => useEditorMouse(api, bodyRef, focus));

    const content = body.querySelector('.editor-content') as HTMLElement;
    const event = { preventDefault: vi.fn(), target: content, clientX: 10, clientY: 10, detail: 1, shiftKey: false } as unknown as React.MouseEvent;
    act(() => { result.current.onMouseDown(event); });

    expect(focus).toHaveBeenCalled();
    expect(api.sealUndo).toHaveBeenCalled();
    expect(api.setState).toHaveBeenCalled();
    body.remove();
  });

  it('selects whole line on gutter click', () => {
    const state = makeState(['hello', 'world']);
    const api = makeApi(state);
    const body = makeEditorBody(2);
    const bodyRef = { current: body } as React.RefObject<HTMLDivElement | null>;
    const focus = vi.fn();
    const { result } = renderHook(() => useEditorMouse(api, bodyRef, focus));

    const gutter = body.querySelector('.editor-gutter') as HTMLElement;
    const event = { preventDefault: vi.fn(), target: gutter, clientX: 5, clientY: 5, detail: 1, shiftKey: false } as unknown as React.MouseEvent;
    act(() => { result.current.onMouseDown(event); });

    expect(api.setState).toHaveBeenCalled();
    const newState = (api.setState as ReturnType<typeof vi.fn>).mock.calls[0][0] as EditorState;
    expect(newState.anchor).toEqual({ line: 0, col: 0 });
    body.remove();
  });

  it('selects word on double click', () => {
    const state = makeState(['hello world', '']);
    const api = makeApi(state);
    const body = makeEditorBody(2);
    const bodyRef = { current: body } as React.RefObject<HTMLDivElement | null>;
    const focus = vi.fn();
    const { result } = renderHook(() => useEditorMouse(api, bodyRef, focus));

    const content = body.querySelector('.editor-content') as HTMLElement;
    const event = { preventDefault: vi.fn(), target: content, clientX: 10, clientY: 10, detail: 2, shiftKey: false } as unknown as React.MouseEvent;
    act(() => { result.current.onMouseDown(event); });

    expect(api.setState).toHaveBeenCalled();
    const newState = (api.setState as ReturnType<typeof vi.fn>).mock.calls[0][0] as EditorState;
    expect(newState.anchor).not.toBeNull();
    body.remove();
  });

  it('extends selection on shift-click', () => {
    const state: EditorState = { lines: ['hello', 'world'], cursor: { line: 0, col: 2 }, anchor: { line: 0, col: 0 } };
    const api = makeApi(state);
    const body = makeEditorBody(2);
    const bodyRef = { current: body } as React.RefObject<HTMLDivElement | null>;
    const focus = vi.fn();
    const { result } = renderHook(() => useEditorMouse(api, bodyRef, focus));

    const content = body.querySelectorAll('.editor-content')[1] as HTMLElement;
    const event = { preventDefault: vi.fn(), target: content, clientX: 10, clientY: 30, detail: 1, shiftKey: true } as unknown as React.MouseEvent;
    act(() => { result.current.onMouseDown(event); });

    expect(api.setState).toHaveBeenCalled();
    const newState = (api.setState as ReturnType<typeof vi.fn>).mock.calls[0][0] as EditorState;
    expect(newState.anchor).toEqual({ line: 0, col: 0 });
    body.remove();
  });

  it('extends selection on drag', () => {
    const state = makeState(['hello', 'world']);
    const api = makeApi(state);
    const body = makeEditorBody(2);
    const bodyRef = { current: body } as React.RefObject<HTMLDivElement | null>;
    const focus = vi.fn();
    const { result } = renderHook(() => useEditorMouse(api, bodyRef, focus));

    const content = body.querySelector('.editor-content') as HTMLElement;
    const downEvent = { preventDefault: vi.fn(), target: content, clientX: 10, clientY: 10, detail: 1, shiftKey: false } as unknown as React.MouseEvent;
    act(() => { result.current.onMouseDown(downEvent); });

    const moveEvent = new MouseEvent('mousemove', { clientX: 20, clientY: 10 });
    act(() => { globalThis.dispatchEvent(moveEvent); });

    const upEvent = new MouseEvent('mouseup');
    act(() => { globalThis.dispatchEvent(upEvent); });

    expect(api.setState).toHaveBeenCalled();
    body.remove();
  });

  it('extends line selection on gutter drag', () => {
    const state = makeState(['hello', 'world', 'third']);
    const api = makeApi(state);
    const body = makeEditorBody(3);
    const bodyRef = { current: body } as React.RefObject<HTMLDivElement | null>;
    const focus = vi.fn();
    const { result } = renderHook(() => useEditorMouse(api, bodyRef, focus));

    const gutter = body.querySelector('.editor-gutter') as HTMLElement;
    const downEvent = { preventDefault: vi.fn(), target: gutter, clientX: 5, clientY: 5, detail: 1, shiftKey: false } as unknown as React.MouseEvent;
    act(() => { result.current.onMouseDown(downEvent); });

    const secondRow = body.querySelectorAll('[data-editor-line]')[1] as HTMLElement;
    const moveEvent = new MouseEvent('mousemove', { clientX: 5, clientY: 30 });
    (document.elementFromPoint as ReturnType<typeof vi.fn>).mockReturnValue(secondRow);
    act(() => { globalThis.dispatchEvent(moveEvent); });

    const upEvent = new MouseEvent('mouseup');
    act(() => { globalThis.dispatchEvent(upEvent); });

    expect(api.setState).toHaveBeenCalled();
    body.remove();
  });

  it('routes a click on the query row into the query state and marks it focused, leaving the buffer untouched', () => {
    const state = makeState(['hello', '']);
    const api = makeApi(state);
    const body = makeEditorBody(2);
    const bodyRef = { current: body } as React.RefObject<HTMLDivElement | null>;
    const focus = vi.fn();
    const queryLine = { anchorLine: 1, state: { lines: ['> summ'], cursor: { line: 0, col: 6 }, anchor: null } };
    const setQueryLineState = vi.fn();
    const setFocusTarget = vi.fn();
    const suggest = { queryLine, setQueryLineState, setFocusTarget };
    const { result } = renderHook(() => useEditorMouse(api, bodyRef, focus, suggest));

    const content = body.querySelectorAll('.editor-content')[1] as HTMLElement;
    const event = { preventDefault: vi.fn(), target: content, clientX: 10, clientY: 30, detail: 1, shiftKey: false } as unknown as React.MouseEvent;
    act(() => { result.current.onMouseDown(event); });

    expect(setFocusTarget).toHaveBeenCalledWith('query');
    expect(setQueryLineState).toHaveBeenCalled();
    expect(api.setState).not.toHaveBeenCalled();
    body.remove();
  });

  it('marks the buffer focused when clicking an ordinary row while a query line is open', () => {
    const state = makeState(['hello', '']);
    const api = makeApi(state);
    const body = makeEditorBody(2);
    const bodyRef = { current: body } as React.RefObject<HTMLDivElement | null>;
    const focus = vi.fn();
    const queryLine = { anchorLine: 1, state: { lines: ['> summ'], cursor: { line: 0, col: 6 }, anchor: null } };
    const setQueryLineState = vi.fn();
    const setFocusTarget = vi.fn();
    const suggest = { queryLine, setQueryLineState, setFocusTarget };
    const { result } = renderHook(() => useEditorMouse(api, bodyRef, focus, suggest));

    const content = body.querySelector('.editor-content') as HTMLElement;
    const event = { preventDefault: vi.fn(), target: content, clientX: 10, clientY: 10, detail: 1, shiftKey: false } as unknown as React.MouseEvent;
    act(() => { result.current.onMouseDown(event); });

    expect(setFocusTarget).toHaveBeenCalledWith('buffer');
    expect(setQueryLineState).not.toHaveBeenCalled();
    expect(api.setState).toHaveBeenCalled();
    body.remove();
  });
});
