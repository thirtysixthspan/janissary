import React, { useCallback, useRef } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useSelectionLayer } from './useSelectionLayer';
import type { SelectionLayerApi } from './useSelectionLayer';
import type { Terminal } from '@xterm/xterm';

// Terminal buffer helpers -------------------------------------------------------------

// A fixed grid the tests lay out by hand, since jsdom lays nothing out on its own.
const RECT = { x: 0, y: 0, left: 0, top: 0, right: 800, bottom: 480, width: 800, height: 480, toJSON: () => {} } as DOMRect;

type FakeBuffer = { active: { viewportY: number; getLine: (index: number) => { translateToString: (trim: boolean) => string } | null } };

function fakeBuffer(lines: string[]): FakeBuffer {
  const padded = [...lines];
  while (padded.length < 24) padded.push('');
  return {
    active: {
      viewportY: 0,
      getLine: (index: number) => (padded[index] === undefined ? null : {
        translateToString: (trim: boolean) => (trim ? padded[index].trimEnd() : padded[index]),
      }),
    },
  };
}

type FakeTerm = { buffer: FakeBuffer; cols: number; rows: number };

// A surface holding the hook against a hand-laid grid: the container is the div tests dispatch
// on, and its children stand in for the inner element xterm renders and the copy of the view the
// component renders.
function Surface({ term, inactive, exited, onApi }: {
  term: FakeTerm; inactive?: boolean; exited?: boolean; onApi?: (api: SelectionLayerApi) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const bind = useCallback((node: HTMLDivElement | null) => {
    containerRef.current = node;
    if (node) vi.spyOn(node, 'getBoundingClientRect').mockReturnValue(RECT);
  }, []);
  // 40 characters of the overlay's probe at 10px-per-cell by 20px-per-row: the measured geometry
  // the hook reads off the real overlay's probe row, laid out by hand here.
  const bindProbe = (node: HTMLDivElement | null) => {
    api.probeRef.current = node;
    if (node) vi.spyOn(node, 'getBoundingClientRect').mockReturnValue({ top: 0, left: 0, width: 400, height: 20 } as DOMRect);
  };
  const api = useSelectionLayer({
    containerRef: containerRef as React.RefObject<HTMLDivElement>,
    termRef: { current: term as unknown as Terminal },
    inactive, exited,
  });
  onApi?.(api);
  return (
    <div data-testid="container" ref={bind}>
      <div data-testid="inner" />
      <div data-testid="probe">{api.view ? api.text() : ''}</div>
      <div data-testid="grid-probe" ref={bindProbe} />
    </div>
  );
}


describe('useSelectionLayer', () => {
  function mount(termLines: string[], onApi?: (api: SelectionLayerApi) => void, inactive?: boolean, exited?: boolean) {
    const term: FakeTerm = { buffer: fakeBuffer(termLines), cols: 80, rows: 24 };
    const view = render(<Surface term={term} inactive={inactive} exited={exited} onApi={onApi} />);
    return { term, view };
  }

  function drag(container: HTMLElement, toX: number, toY: number, fromX = 5, fromY = 10): void {
    const pointer = (type: string, x: number, y: number, shift: boolean) => {
      const e = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y });
      Object.defineProperties(e, { button: { value: 0 }, shiftKey: { value: shift } });
      return e;
    };
    // React batches the pointer-driven state updates; act keeps them flush before each assertion.
    act(() => {
      container.dispatchEvent(pointer('pointerdown', fromX, fromY, true));
      container.dispatchEvent(pointer('pointermove', toX, toY, true));
      container.dispatchEvent(pointer('pointerup', toX, toY, true));
    });
  }

  it('takes a snapshot on Shift+pointerdown, consumes it, and extends through the drag', () => {
    mount(['aa bb', 'cc dd      ']);
    const container = screen.getByTestId('container');
    const down = new MouseEvent('pointerdown', { bubbles: true, clientX: 5, clientY: 10 });
    Object.defineProperties(down, {
    	button: { value: 0 },
    	shiftKey: { value: true },
    });
    const prevented = vi.fn();
    down.preventDefault = prevented;
    const stopped = vi.fn();
    down.stopPropagation = stopped;
    act(() => {
      container.dispatchEvent(down);
      container.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 45, clientY: 90 }));
    });
    expect(screen.getByTestId('probe').textContent).toBe('aa bb\ncc dd');
    expect(prevented).toHaveBeenCalled();
    expect(stopped).toHaveBeenCalled();
  });

  it('clears a held selection on a plain click and consumes that event too', () => {
    mount(['aa bb', 'cc dd']);
    const container = screen.getByTestId('container');
    drag(container, 45, 90);
    expect(screen.getByTestId('probe').textContent).not.toBe('');
    const clear = new MouseEvent('pointerdown', { bubbles: true, clientX: 20, clientY: 20 });
    Object.defineProperty(clear, 'button', { value: 0 });
    const prevented = vi.fn();
    clear.preventDefault = prevented;
    act(() => { container.dispatchEvent(clear); });
    expect(screen.getByTestId('probe').textContent).toBe('');
    expect(prevented).toHaveBeenCalled();
  });

  it('ends the drag on a pointerup outside the container', () => {
    mount(['aa bb', 'cc dd']);
    const container = screen.getByTestId('container');
    drag(container, 45, 90);
    expect(screen.getByTestId('probe').textContent).not.toBe('');
    globalThis.dispatchEvent(new MouseEvent('pointerup', { clientX: 50, clientY: 90 }));
    fireEvent(container, new MouseEvent('pointermove', { bubbles: true, clientX: 100, clientY: 120 }));
    expect(screen.getByTestId('probe').textContent).toBe('aa bb\ncc dd');
  });

  it('unfreezes on release when a Shift+click picks nothing', () => {
    mount(['aa bb', 'cc dd']);
    const container = screen.getByTestId('container');
    const pointer = (type: string, x: number, y: number, shift: boolean) => {
      const e = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y });
      Object.defineProperties(e, { button: { value: 0 }, shiftKey: { value: shift } });
      return e;
    };
    act(() => {
      container.dispatchEvent(pointer('pointerdown', 5, 10, true));
      container.dispatchEvent(pointer('pointerup', 5, 10, true));
    });
    expect(screen.getByTestId('probe').textContent).toBe('');
  });

  it('dismisses a zero-length overlay on a plain click and consumes that click', () => {
    let api: SelectionLayerApi | undefined;
    mount(['aa bb', 'cc dd'], (held) => { api = held; });
    const container = screen.getByTestId('container');
    const pointer = (type: string, x: number, y: number, shift: boolean) => {
      const e = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y });
      Object.defineProperties(e, { button: { value: 0 }, shiftKey: { value: shift } });
      return e;
    };
    act(() => {
      container.dispatchEvent(pointer('pointerdown', 5, 10, true));
    });
    expect(api?.view).not.toBeNull();
    const clear = new MouseEvent('pointerdown', { bubbles: true, clientX: 20, clientY: 20 });
    Object.defineProperty(clear, 'button', { value: 0 });
    const prevented = vi.fn();
    clear.preventDefault = prevented;
    act(() => { container.dispatchEvent(clear); });
    expect(api?.view).toBeNull();
    expect(prevented).toHaveBeenCalled();
  });

  it('re-snapshots and replaces on a second Shift+pointerdown', () => {
    const { term } = mount(['first screenful']);
    const container = screen.getByTestId('container');
    drag(container, 45, 90);
    expect(screen.getByTestId('probe').textContent).toBe('first screenful');
    term.buffer = fakeBuffer(['second screenful']);
    drag(container, 45, 90);
    expect(screen.getByTestId('probe').textContent).toBe('second screenful');
  });

  it('drops both snapshot and range on clear', () => {
    let api: SelectionLayerApi | undefined;
    mount(['aa bb', 'cc dd'], (held) => { api = held; });
    const container = screen.getByTestId('container');
    drag(container, 45, 90);
    expect(screen.getByTestId('probe').textContent).not.toBe('');
    act(() => { api?.clear(); });
    expect(screen.getByTestId('probe').textContent).toBe('');
  });

  it('keeps the pick exact when the terminal keeps writing underneath', () => {
    const { term } = mount(['aa bb', 'cc dd']);
    const container = screen.getByTestId('container');
    drag(container, 45, 90);
    term.buffer = fakeBuffer(['totally different output', 'now']);
    expect(screen.getByTestId('probe').textContent).toBe('aa bb\ncc dd');
  });

  it.each([
    ['exits', true, undefined],
    ['goes inactive', undefined, true],
  ])('clears when the surface %s', (_name, exited, inactive) => {
    const { term, view } = mount(['aa bb', 'cc dd'], undefined, inactive, exited);
    const container = screen.getByTestId('container');
    drag(container, 45, 90);
    expect(screen.getByTestId('probe').textContent).not.toBe('');
    view.rerender(<Surface term={term} inactive={inactive ?? true} exited={exited ?? true} />);
    expect(screen.getByTestId('probe').textContent).toBe('');
  });

  it('clears the held selection on a real keydown Escape inside the container', () => {
    mount(['aa bb', 'cc dd']);
    const container = screen.getByTestId('container');
    drag(container, 45, 90);
    expect(screen.getByTestId('probe').textContent).toBe('aa bb\ncc dd');
    const key = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
    const prevented = vi.fn();
    key.preventDefault = prevented;
    act(() => { container.dispatchEvent(key); });
    expect(screen.getByTestId('probe').textContent).toBe('');
    expect(prevented).toHaveBeenCalled();
  });

  it('leaves the held selection alone when Escape is pressed outside the container', () => {
    mount(['aa bb', 'cc dd']);
    const container = screen.getByTestId('container');
    drag(container, 45, 90);
    expect(screen.getByTestId('probe').textContent).toBe('aa bb\ncc dd');
    const key = new KeyboardEvent('keydown', { key: 'Escape' });
    const prevented = vi.fn();
    key.preventDefault = prevented;
    act(() => { globalThis.dispatchEvent(key); });
    expect(screen.getByTestId('probe').textContent).toBe('aa bb\ncc dd');
    expect(prevented).not.toHaveBeenCalled();
  });
});
