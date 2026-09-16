import React from 'react';
import { act, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Surface, drag, fakeBuffer, mountSelectionLayer } from './useSelectionLayer.test-support';
import type { SelectionLayerApi } from './useSelectionLayer';

describe('useSelectionLayer lifecycle', () => {
  it('re-snapshots and replaces on a second Shift+pointerdown', () => {
    const { term } = mountSelectionLayer(['first screenful']);
    const container = screen.getByTestId('container');
    drag(container, 45, 90);
    expect(screen.getByTestId('probe').textContent).toBe('first screenful');
    term.buffer = fakeBuffer(['second screenful']);
    drag(container, 45, 90);
    expect(screen.getByTestId('probe').textContent).toBe('second screenful');
  });

  it('drops both snapshot and range on clear', () => {
    let api: SelectionLayerApi | undefined;
    mountSelectionLayer(['aa bb', 'cc dd'], (held) => { api = held; });
    const container = screen.getByTestId('container');
    drag(container, 45, 90);
    expect(screen.getByTestId('probe').textContent).not.toBe('');
    act(() => { api?.clear(); });
    expect(screen.getByTestId('probe').textContent).toBe('');
  });

  it('keeps the pick exact when the terminal keeps writing underneath', () => {
    const { term } = mountSelectionLayer(['aa bb', 'cc dd']);
    const container = screen.getByTestId('container');
    drag(container, 45, 90);
    term.buffer = fakeBuffer(['totally different output', 'now']);
    expect(screen.getByTestId('probe').textContent).toBe('aa bb\ncc dd');
  });

  it.each([
    ['exits', true, undefined],
    ['goes inactive', undefined, true],
  ])('clears when the surface %s', (_name, exited, inactive) => {
    const { term, view } = mountSelectionLayer(['aa bb', 'cc dd'], undefined, inactive, exited);
    const container = screen.getByTestId('container');
    drag(container, 45, 90);
    expect(screen.getByTestId('probe').textContent).not.toBe('');
    view.rerender(<Surface term={term} inactive={inactive ?? true} exited={exited ?? true} />);
    expect(screen.getByTestId('probe').textContent).toBe('');
  });

  it('clears the held selection on a real keydown Escape inside the container', () => {
    mountSelectionLayer(['aa bb', 'cc dd']);
    const container = screen.getByTestId('container');
    drag(container, 45, 90);
    const key = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
    const prevented = vi.fn();
    key.preventDefault = prevented;
    act(() => { container.dispatchEvent(key); });
    expect(screen.getByTestId('probe').textContent).toBe('');
    expect(prevented).toHaveBeenCalled();
  });

  it('leaves the held selection alone when Escape is pressed outside the container', () => {
    mountSelectionLayer(['aa bb', 'cc dd']);
    const container = screen.getByTestId('container');
    drag(container, 45, 90);
    const key = new KeyboardEvent('keydown', { key: 'Escape' });
    const prevented = vi.fn();
    key.preventDefault = prevented;
    act(() => { globalThis.dispatchEvent(key); });
    expect(screen.getByTestId('probe').textContent).toBe('aa bb\ncc dd');
    expect(prevented).not.toHaveBeenCalled();
  });
});
