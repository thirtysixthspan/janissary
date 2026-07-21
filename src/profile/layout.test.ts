import { describe, it, expect, vi, beforeEach } from 'vitest';
import { applyProfileLayout } from './layout.js';
import { setWindowResizer } from '../window-resizer.js';
import { messageBus } from '../bus.js';
import type { Managers } from '../managers.js';

describe('applyProfileLayout', () => {
  beforeEach(() => {
    setWindowResizer(undefined);
  });

  it('invokes the registered window resizer with the right width/height and appends a note', () => {
    const resize = vi.fn().mockResolvedValue(undefined);
    setWindowResizer(resize);
    const notes: string[] = [];

    applyProfileLayout({ window: { width: 1440, height: 900 } }, {} as Managers, notes);

    expect(resize).toHaveBeenCalledWith(1440, 900);
    expect(notes).toEqual(['Resized window to 1440x900.']);
  });

  it('skips silently when no window resizer is registered', () => {
    const notes: string[] = [];

    expect(() => applyProfileLayout({ window: { width: 1440, height: 900 } }, {} as Managers, notes)).not.toThrow();
    expect(notes).toEqual([]);
  });

  it('broadcasts a LayoutEvent carrying exactly the specified sidebar/tab-area fields', () => {
    const emitSpy = vi.spyOn(messageBus, 'emit');
    const notes: string[] = [];

    applyProfileLayout({ sidebarLeft: 320, tabAreaPct: 75 }, {} as Managers, notes);

    expect(emitSpy).toHaveBeenCalledWith('layout', { type: 'update', sidebarLeft: 320, sidebarRight: undefined, tabAreaPct: 75 });
    expect(notes).toEqual(['Resized sidebars/tab area.']);
    emitSpy.mockRestore();
  });

  it('does nothing when the profile has no layout', () => {
    const notes: string[] = [];

    applyProfileLayout(null, {} as Managers, notes);

    expect(notes).toEqual([]);
  });
});
