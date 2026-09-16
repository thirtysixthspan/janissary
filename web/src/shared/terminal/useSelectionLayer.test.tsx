import { act, fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SelectionLayerApi } from './useSelectionLayer';
import { drag, mountSelectionLayer } from './useSelectionLayer.test-support';


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
