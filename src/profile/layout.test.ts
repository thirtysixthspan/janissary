import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { applyProfileLayout } from './layout.js';
import { initProfileDir } from '../profiles.js';
import { setWindowResizer } from '../window-resizer.js';
import { messageBus } from '../bus.js';
import type { Managers } from '../managers.js';

describe('applyProfileLayout', () => {
  let root: string;

  const writeLayout = (profile: string, contents: string) => {
    const dir = path.join(root, 'profiles', profile);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, '_layout.json'), contents);
  };

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'janus-proflayout-'));
    initProfileDir(root);
    setWindowResizer(undefined);
  });

  afterAll(() => {
    if (root) rmSync(root, { recursive: true, force: true });
  });

  it('invokes the registered window resizer with the right width/height and appends a note', () => {
    writeLayout('claude', JSON.stringify({ layout: { window: { width: 1440, height: 900 } } }));
    const resize = vi.fn().mockResolvedValue(undefined);
    setWindowResizer(resize);
    const notes: string[] = [];

    applyProfileLayout('claude', {} as Managers, notes);

    expect(resize).toHaveBeenCalledWith(1440, 900);
    expect(notes).toEqual(['Resized window to 1440x900.']);
  });

  it('skips silently when no window resizer is registered', () => {
    writeLayout('claude', JSON.stringify({ layout: { window: { width: 1440, height: 900 } } }));
    const notes: string[] = [];

    expect(() => applyProfileLayout('claude', {} as Managers, notes)).not.toThrow();
    expect(notes).toEqual([]);
  });

  it('broadcasts a LayoutEvent carrying exactly the specified sidebar/tab-area fields', () => {
    writeLayout('claude', JSON.stringify({ layout: { sidebarLeft: 320, tabAreaPct: 75 } }));
    const emitSpy = vi.spyOn(messageBus, 'emit');
    const notes: string[] = [];

    applyProfileLayout('claude', {} as Managers, notes);

    expect(emitSpy).toHaveBeenCalledWith('layout', { type: 'update', sidebarLeft: 320, sidebarRight: undefined, tabAreaPct: 75 });
    expect(notes).toEqual(['Resized sidebars/tab area.']);
    emitSpy.mockRestore();
  });

  it('does nothing when the profile has no _layout.json', () => {
    const notes: string[] = [];

    applyProfileLayout('claude', {} as Managers, notes);

    expect(notes).toEqual([]);
  });
});
