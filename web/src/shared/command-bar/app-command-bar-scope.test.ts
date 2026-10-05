import { describe, expect, it, vi } from 'vitest';
import { scopeAppCommandBar, type AppCommandBarState } from './app-command-bar-scope';

const register = () => () => {};

function state(overrides: Partial<AppCommandBarState> = {}): AppCommandBarState {
  return {
    intercept: vi.fn(() => false),
    ghostHistory: ['ls'],
    queueTab: 'agent',
    queueOpen: true,
    queueIndex: 1,
    queueItems: ['first', 'second'],
    onEditQueued: vi.fn(),
    onDeleteQueued: vi.fn(),
    ...overrides,
  };
}

describe('scopeAppCommandBar', () => {
  it('hands the queue popup and its edits to the tab it is open over', () => {
    const app = state();
    const bar = scopeAppCommandBar(app, 'agent', register);

    expect(bar.queueOpen).toBe(true);
    expect(bar.queueIndex).toBe(1);
    expect(bar.queueItems).toEqual(['first', 'second']);
    expect(bar.onEditQueued).toBe(app.onEditQueued);
    expect(bar.onDeleteQueued).toBe(app.onDeleteQueued);
  });

  it('shows every other tab the popup closed and empty, with nothing to edit or delete', () => {
    const bar = scopeAppCommandBar(state(), 'shell1', register);

    expect(bar.queueOpen).toBe(false);
    expect(bar.queueIndex).toBe(0);
    expect(bar.queueItems).toEqual([]);
    expect(bar.onEditQueued).toBeUndefined();
    expect(bar.onDeleteQueued).toBeUndefined();
  });

  it('intercepts a line as typed in its own tab and reports its own focus', () => {
    const onFocusTab = vi.fn();
    const app = state({ onFocusTab });
    const bar = scopeAppCommandBar(app, 'shell1', register);

    bar.intercept('close');
    bar.onFocusChange(true);
    bar.onFocusChange(false);

    expect(app.intercept).toHaveBeenCalledWith('close', 'shell1', true);
    expect(onFocusTab).toHaveBeenNthCalledWith(1, 'shell1');
    expect(onFocusTab).toHaveBeenNthCalledWith(2, undefined);
  });

  it('intercepts a line from a body that is not on screen as such', () => {
    const app = state();
    scopeAppCommandBar(app, 'shell1', register, false).intercept('tasks');
    expect(app.intercept).toHaveBeenCalledWith('tasks', 'shell1', false);
  });

  it('reads its own command queue rather than the queue the popup lists', () => {
    const queues: Record<string, string[]> = { shell1: ['!ls'], agent: ['first'] };
    const bar = scopeAppCommandBar(state({ queuedLinesOf: (label) => queues[label] }), 'shell1', register);

    expect(bar.queuedLines).toEqual(['!ls']);
    expect(scopeAppCommandBar(state(), 'shell1', register).queuedLines).toEqual([]);
  });

  it('reads the overlay flags as plain answers when the app leaves them unset', () => {
    const bar = scopeAppCommandBar(state(), 'shell1', register);

    expect(bar.blockingOverlayOpen).toBe(false);
    expect(bar.overlayOwnsCommandBar).toBe(false);
    expect(bar.ghostHistory).toEqual(['ls']);
  });
});
