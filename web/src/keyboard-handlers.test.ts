import { describe, it, expect, vi } from 'vitest';
import { handleRouteChooserKey, handlePickerKey } from './keyboard-handlers';
import type { RouteChooserView } from '@shared/protocol';

function fakeEvent(key: string): KeyboardEvent {
  return new KeyboardEvent('keydown', { key });
}

function makeRoute(): RouteChooserView {
  return { cmd: 'route', choices: ['cmd1', 'cmd2', 'cmd3'] };
}

describe('handleRouteChooserKey', () => {
  it('returns false for an unhandled key', () => {
    const e = fakeEvent('a');
    expect(handleRouteChooserKey(e, makeRoute(), 0, vi.fn(), vi.fn())).toBe(false);
  });

  it('moves up on ArrowUp, clamped at 0', () => {
    const e = fakeEvent('ArrowUp');
    const setIdx = vi.fn();
    expect(handleRouteChooserKey(e, makeRoute(), 1, setIdx, vi.fn())).toBe(true);
    expect(setIdx).toHaveBeenCalledWith(expect.any(Function));
    const fn = setIdx.mock.calls[0][0] as (n: number) => number;
    expect(fn(1)).toBe(0);
    expect(fn(0)).toBe(0);
  });

  it('moves down on ArrowDown, clamped at length-1', () => {
    const e = fakeEvent('ArrowDown');
    const setIdx = vi.fn();
    expect(handleRouteChooserKey(e, makeRoute(), 0, setIdx, vi.fn())).toBe(true);
    const fn = setIdx.mock.calls[0][0] as (n: number) => number;
    expect(fn(0)).toBe(1);
    expect(fn(2)).toBe(2);
  });

  it('calls chooseRoute with current index on Enter', () => {
    const e = fakeEvent('Enter');
    const chooseRoute = vi.fn();
    handleRouteChooserKey(e, makeRoute(), 2, vi.fn(), chooseRoute);
    expect(chooseRoute).toHaveBeenCalledWith(2);
  });

  it('calls chooseRoute with -1 on Escape', () => {
    const e = fakeEvent('Escape');
    const chooseRoute = vi.fn();
    handleRouteChooserKey(e, makeRoute(), 0, vi.fn(), chooseRoute);
    expect(chooseRoute).toHaveBeenCalledWith(-1);
  });
});

describe('handlePickerKey', () => {
  it('returns false for an unhandled key', () => {
    const e = fakeEvent('a');
    expect(handlePickerKey(e, [], 0, vi.fn(), vi.fn(), vi.fn())).toBe(false);
  });

  it('moves up on ArrowUp, clamped at 0', () => {
    const e = fakeEvent('ArrowUp');
    const setIdx = vi.fn();
    handlePickerKey(e, ['a', 'b'], 1, setIdx, vi.fn(), vi.fn());
    const fn = setIdx.mock.calls[0][0] as (n: number) => number;
    expect(fn(1)).toBe(0);
    expect(fn(0)).toBe(0);
  });

  it('moves down on ArrowDown, clamped at length-1', () => {
    const e = fakeEvent('ArrowDown');
    const setIdx = vi.fn();
    handlePickerKey(e, ['a', 'b'], 0, setIdx, vi.fn(), vi.fn());
    const fn = setIdx.mock.calls[0][0] as (n: number) => number;
    expect(fn(0)).toBe(1);
    expect(fn(1)).toBe(1);
  });

  it('runs the command and closes picker on Enter', () => {
    const e = fakeEvent('Enter');
    const runCommand = vi.fn();
    const setPickerOpen = vi.fn();
    handlePickerKey(e, ['cmd1', 'cmd2'], 1, vi.fn(), runCommand, setPickerOpen);
    expect(runCommand).toHaveBeenCalledWith('cmd2');
    expect(setPickerOpen).toHaveBeenCalledWith(false);
  });

  it('closes the picker on Escape', () => {
    const e = fakeEvent('Escape');
    const setPickerOpen = vi.fn();
    handlePickerKey(e, [], 0, vi.fn(), vi.fn(), setPickerOpen);
    expect(setPickerOpen).toHaveBeenCalledWith(false);
  });
});
