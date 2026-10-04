import { describe, expect, it, vi } from 'vitest';
import { createShellScrollKeyHandlers } from './shell-scroll-keys';

describe('createShellScrollKeyHandlers', () => {
  it('scrolls by half a screen and returns to the bottom', () => {
    const target = { rows: 40, scrollLines: vi.fn(), scrollToBottom: vi.fn() };
    const handlers = createShellScrollKeyHandlers(target);
    const pageUp = new KeyboardEvent('keydown', { key: 'PageUp', cancelable: true });
    const escape = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });

    expect(handlers.keydown(pageUp)).toBe(true);
    expect(pageUp.defaultPrevented).toBe(true);
    expect(target.scrollLines).toHaveBeenCalledWith(-20);
    expect(handlers.keydown(escape)).toBe(true);
    expect(target.scrollToBottom).toHaveBeenCalledOnce();
  });

  it('accelerates modified arrows and resets its direction after keyup', () => {
    const target = { rows: 40, scrollLines: vi.fn(), scrollToBottom: vi.fn() };
    const handlers = createShellScrollKeyHandlers(target);
    const up = new KeyboardEvent('keydown', { key: 'ArrowUp', shiftKey: true, cancelable: true });

    expect(handlers.keydown(up)).toBe(true);
    expect(target.scrollLines).toHaveBeenLastCalledWith(-1);
    handlers.keyup(new KeyboardEvent('keyup', { key: 'ArrowUp' }));
    handlers.keydown(new KeyboardEvent('keydown', { key: 'ArrowDown', ctrlKey: true, cancelable: true }));
    expect(target.scrollLines).toHaveBeenLastCalledWith(1);
  });

  it('leaves unrelated keys alone', () => {
    const target = { rows: 40, scrollLines: vi.fn(), scrollToBottom: vi.fn() };
    const handlers = createShellScrollKeyHandlers(target);

    expect(handlers.keydown(new KeyboardEvent('keydown', { key: 'ArrowUp', cancelable: true }))).toBe(false);
    expect(handlers.keydown(new KeyboardEvent('keydown', { key: 'Escape', ctrlKey: true, cancelable: true }))).toBe(false);
    expect(target.scrollLines).not.toHaveBeenCalled();
  });
});
