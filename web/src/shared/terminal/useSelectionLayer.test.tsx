import { act, fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SelectionLayerApi } from './useSelectionLayer';
import { drag, fakeTerminalElement, mountSelectionLayer } from './useSelectionLayer.test-support';


// Four rows of ten characters: enough screen for the same drag to land on different cells
// depending on which origin and grid resolve it.
const GRID_LINES = ['row zero..', 'row one...', 'abcdefghij', 'klmnopqrst'];

describe('useSelectionLayer gestures', () => {

  it('takes a snapshot on Shift+pointerdown, consumes it, and extends through the drag', () => {
    mountSelectionLayer(['aa bb', 'cc dd      ']);
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
    mountSelectionLayer(['aa bb', 'cc dd']);
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
    mountSelectionLayer(['aa bb', 'cc dd']);
    const container = screen.getByTestId('container');
    drag(container, 45, 90);
    expect(screen.getByTestId('probe').textContent).not.toBe('');
    globalThis.dispatchEvent(new MouseEvent('pointerup', { clientX: 50, clientY: 90 }));
    fireEvent(container, new MouseEvent('pointermove', { bubbles: true, clientX: 100, clientY: 120 }));
    expect(screen.getByTestId('probe').textContent).toBe('aa bb\ncc dd');
  });

  it('focuses the terminal on Shift+pointerdown so the copy paths reach the pick', () => {
    const { term } = mountSelectionLayer(['aa bb', 'cc dd']);
    const container = screen.getByTestId('container');
    const down = new MouseEvent('pointerdown', { bubbles: true, clientX: 5, clientY: 10 });
    Object.defineProperties(down, { button: { value: 0 }, shiftKey: { value: true } });
    act(() => {
      container.dispatchEvent(down);
    });
    expect(term.focus).toHaveBeenCalled();
  });

  it('takes the mousedown xterm is bound to once the gesture owns it', () => {
    mountSelectionLayer(['aa bb', 'cc dd']);
    const container = screen.getByTestId('container');
    const down = new MouseEvent('pointerdown', { bubbles: true, clientX: 5, clientY: 10 });
    Object.defineProperties(down, { button: { value: 0 }, shiftKey: { value: true } });
    act(() => {
      container.dispatchEvent(down);
    });
    const e = new MouseEvent('mousedown', { bubbles: true, clientX: 5, clientY: 10 });
    Object.defineProperty(e, 'button', { value: 0 });
    const prevented = vi.fn();
    const stopped = vi.fn();
    e.preventDefault = prevented; e.stopPropagation = stopped;
    act(() => { container.dispatchEvent(e); });
    expect(prevented).toHaveBeenCalled();
    expect(stopped).toHaveBeenCalled();
  });

  it('lets a plain unguarded mousedown through to the terminal', () => {
    mountSelectionLayer(['aa bb', 'cc dd']);
    const container = screen.getByTestId('container');
    const e = new MouseEvent('mousedown', { bubbles: true, clientX: 5, clientY: 10 });
    Object.defineProperty(e, 'button', { value: 0 });
    const prevented = vi.fn();
    e.preventDefault = prevented;
    act(() => { container.dispatchEvent(e); });
    expect(prevented).not.toHaveBeenCalled();
  });

  it('unfreezes on release when a Shift+click picks nothing', () => {
    mountSelectionLayer(['aa bb', 'cc dd']);
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

  it('opens the context menu at the release point once a drag picks text', () => {
    mountSelectionLayer(['aa bb', 'cc dd']);
    const container = screen.getByTestId('container');
    const onContextMenu = vi.fn();
    container.addEventListener('contextmenu', onContextMenu);
    drag(container, 45, 90);
    expect(onContextMenu).toHaveBeenCalledOnce();
    const event = onContextMenu.mock.calls[0][0] as MouseEvent;
    expect(event.clientX).toBe(45);
    expect(event.clientY).toBe(90);
  });

  it('opens no context menu when a drag picks nothing', () => {
    mountSelectionLayer(['aa bb', 'cc dd']);
    const container = screen.getByTestId('container');
    const onContextMenu = vi.fn();
    container.addEventListener('contextmenu', onContextMenu);
    drag(container, 5, 10, 5, 10);
    expect(onContextMenu).not.toHaveBeenCalled();
  });

  it('opens no context menu for a pointerup with no active drag', () => {
    mountSelectionLayer(['aa bb', 'cc dd']);
    const container = screen.getByTestId('container');
    const onContextMenu = vi.fn();
    container.addEventListener('contextmenu', onContextMenu);
    drag(container, 45, 90);
    onContextMenu.mockClear();
    globalThis.dispatchEvent(new MouseEvent('pointerup', { clientX: 50, clientY: 90 }));
    expect(onContextMenu).not.toHaveBeenCalled();
  });

  it('freezes the rendered screen alongside the snapshot', () => {
    let api: SelectionLayerApi | undefined;
    mountSelectionLayer(['aa bb', 'cc dd'], (held) => { api = held; }, undefined, undefined, fakeTerminalElement());
    drag(screen.getByTestId('container'), 45, 90);
    expect(api?.screen?.node).not.toBeNull();
    expect(api?.screen?.ownerClass).toBe('xterm xterm-dom-renderer-owner-7');
    expect(api?.screen?.node?.querySelector('.xterm-rows')).not.toBeNull();
  });

  it('resolves the drag through the terminal screen box, not the container corner', () => {
    let api: SelectionLayerApi | undefined;
    // The screen sits 20px in and 40px down from the container's corner, on the same 10x20 cells.
    // The drag's two ends land on the first cell of the screen and five cells into its second row,
    // where the container's own corner would have put them two cells further along and down.
    mountSelectionLayer(GRID_LINES, (held) => { api = held; }, undefined, undefined,
      fakeTerminalElement({ left: 20, top: 40, width: 800, height: 480 }));
    drag(screen.getByTestId('container'), 70, 65, 25, 45);
    expect(api?.view?.anchor).toEqual({ col: 0, row: 0 });
    expect(api?.view?.head).toEqual({ col: 5, row: 1 });
    expect(screen.getByTestId('probe').textContent).toBe('row zero..\nrow o');
  });

  it('falls back to the container grid for a surface with no rendered screen', () => {
    let api: SelectionLayerApi | undefined;
    mountSelectionLayer(GRID_LINES, (held) => { api = held; });
    drag(screen.getByTestId('container'), 70, 65, 25, 45);
    expect(api?.screen?.node).toBeNull();
    expect(api?.view?.anchor).toEqual({ col: 2, row: 2 });
    expect(api?.view?.head).toEqual({ col: 7, row: 3 });
  });

  it('dismisses a zero-length overlay on a plain click and consumes that click', () => {
    let api: SelectionLayerApi | undefined;
    mountSelectionLayer(['aa bb', 'cc dd'], (held) => { api = held; });
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

});
