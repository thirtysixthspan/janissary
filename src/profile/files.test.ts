import { describe, it, expect, vi } from 'vitest';
import { openProfileFiles } from './files.js';
import type { Managers } from '../managers.js';
import type { ProfileFilesEntry } from '../types.js';

function makeManagers(): { managers: Managers; open: ReturnType<typeof vi.fn> } {
  const open = vi.fn();
  const managers = { fileTree: { open } } as unknown as Managers;
  return { managers, open };
}

describe('openProfileFiles', () => {
  const run = (files: ProfileFilesEntry[], defaultLabel: string | undefined, notes: string[] = []) => {
    const { managers, open } = makeManagers();
    openProfileFiles(files, managers, defaultLabel, notes);
    return { open, notes };
  };

  it('opens a bare files tab at the default label when neither dock nor in is set', () => {
    const { open, notes } = run([{}], 'claude');
    expect(open).toHaveBeenCalledWith('files', 'claude');
    expect(notes).toEqual(['Opened file navigator.']);
  });

  it('builds "files on <side>" using the default label when only dock is set', () => {
    const { open, notes } = run([{ dock: 'left' }], 'claude');
    expect(open).toHaveBeenCalledWith('files on left', 'claude');
    expect(notes).toEqual(['Opened file navigator (docked left).']);
  });

  it('builds "files in <label>" and targets that label instead of the default', () => {
    const { open } = run([{ in: 'other' }], 'claude');
    expect(open).toHaveBeenCalledWith('files in other', 'other');
  });

  it('builds "files in <label> on <side>" when both are set', () => {
    const { open } = run([{ in: 'other', dock: 'right' }], 'claude');
    expect(open).toHaveBeenCalledWith('files in other on right', 'other');
  });

  it('appends the path after the clauses when path is set', () => {
    const { open, notes } = run([{ dock: 'left', path: '$root' }], 'claude');
    expect(open).toHaveBeenCalledWith('files on left $root', 'claude');
    expect(notes).toEqual(['Opened file navigator (docked left).']);
  });

  it('builds "files <path>" when only path is set', () => {
    const { open } = run([{ path: '$root' }], 'claude');
    expect(open).toHaveBeenCalledWith('files $root', 'claude');
  });

  it('combines in, dock, and path into one command', () => {
    const { open } = run([{ in: 'other', dock: 'right', path: './sub' }], 'claude');
    expect(open).toHaveBeenCalledWith('files in other on right ./sub', 'other');
  });

  it('skips with a note when there is no default label and the entry has no in', () => {
    const { open, notes } = run([{ dock: 'left' }], undefined);
    expect(open).not.toHaveBeenCalled();
    expect(notes).toEqual(['File navigator: no tab to root it at.']);
  });

  it('does nothing when there are no files entries', () => {
    const { open, notes } = run([], 'claude');
    expect(open).not.toHaveBeenCalled();
    expect(notes).toEqual([]);
  });
});
