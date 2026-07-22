import { describe, expect, it, vi } from 'vitest';
import { openProfileEditors } from './editors.js';
import type { Managers } from '../managers.js';

function makeManagers(): { managers: Managers; edit: ReturnType<typeof vi.fn> } {
  const edit = vi.fn();
  const managers = {
    openFile: { edit },
    tab: { tabs: [{ label: 'editor' }], activeTab: 0 },
  } as unknown as Managers;
  return { managers, edit };
}

describe('openProfileEditors', () => {
  it('opens an editor at the default label and returns its focus presentation', () => {
    const { managers, edit } = makeManagers();
    const opened = openProfileEditors([{ path: '$root/product/backlog/features.md', tab: { number: 2, focus: true } }], managers, 'agent', []);

    expect(edit).toHaveBeenCalledWith('edit $root/product/backlog/features.md', '$root/product/backlog/features.md', 'agent', undefined);
    expect(opened).toEqual([{ label: 'editor', number: 2, focus: true }]);
  });

  it('uses the named resolving tab and passes a requested line through', () => {
    const { managers, edit } = makeManagers();
    openProfileEditors([{ path: './notes.txt', in: 'harness', line: 8 }], managers, 'agent', []);

    expect(edit).toHaveBeenCalledWith('edit ./notes.txt', './notes.txt', 'harness', 8);
  });

  it('skips an unrooted editor with a note', () => {
    const { managers, edit } = makeManagers();
    const notes: string[] = [];
    expect(openProfileEditors([{ path: 'new.txt' }], managers, undefined, notes)).toEqual([]);
    expect(edit).not.toHaveBeenCalled();
    expect(notes).toEqual(['Editor tab: no tab to root it at.']);
  });

  it('passes a missing-file path to edit without checking the disk', () => {
    const { managers, edit } = makeManagers();
    openProfileEditors([{ path: './missing.txt' }], managers, 'agent', []);
    expect(edit).toHaveBeenCalledWith('edit ./missing.txt', './missing.txt', 'agent', undefined);
  });
});
