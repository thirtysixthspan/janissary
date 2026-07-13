import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { openProfileFiles } from './files.js';
import { initProfileDir } from '../profiles.js';
import type { Managers } from '../managers.js';

function makeManagers(): { managers: Managers; open: ReturnType<typeof vi.fn> } {
  const open = vi.fn();
  const managers = { fileTree: { open } } as unknown as Managers;
  return { managers, open };
}

describe('openProfileFiles', () => {
  let root: string;

  const writeFiles = (profile: string, contents: string) => {
    const dir = path.join(root, 'profiles', profile);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, '_files.json'), contents);
  };

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'janus-proffiles-'));
    initProfileDir(root);
  });

  afterAll(() => {
    if (root) rmSync(root, { recursive: true, force: true });
  });

  it('opens a bare files tab at the default label when neither dock nor in is set', () => {
    writeFiles('claude', JSON.stringify([{}]));
    const { managers, open } = makeManagers();
    const notes: string[] = [];

    openProfileFiles('claude', managers, 'claude', notes);

    expect(open).toHaveBeenCalledWith('files', 'claude');
    expect(notes).toEqual(['Opened file navigator.']);
  });

  it('builds "files on <side>" using the default label when only dock is set', () => {
    writeFiles('claude', JSON.stringify([{ dock: 'left' }]));
    const { managers, open } = makeManagers();
    const notes: string[] = [];

    openProfileFiles('claude', managers, 'claude', notes);

    expect(open).toHaveBeenCalledWith('files on left', 'claude');
    expect(notes).toEqual(['Opened file navigator (docked left).']);
  });

  it('builds "files in <label>" and targets that label instead of the default', () => {
    writeFiles('mixed', JSON.stringify([{ in: 'other' }]));
    const { managers, open } = makeManagers();
    const notes: string[] = [];

    openProfileFiles('mixed', managers, 'claude', notes);

    expect(open).toHaveBeenCalledWith('files in other', 'other');
  });

  it('builds "files in <label> on <side>" when both are set', () => {
    writeFiles('mixed', JSON.stringify([{ in: 'other', dock: 'right' }]));
    const { managers, open } = makeManagers();
    const notes: string[] = [];

    openProfileFiles('mixed', managers, 'claude', notes);

    expect(open).toHaveBeenCalledWith('files in other on right', 'other');
  });

  it('skips with a note when there is no default label and the entry has no in', () => {
    writeFiles('claude', JSON.stringify([{ dock: 'left' }]));
    const { managers, open } = makeManagers();
    const notes: string[] = [];

    openProfileFiles('claude', managers, undefined, notes);

    expect(open).not.toHaveBeenCalled();
    expect(notes).toEqual(['File navigator: no tab to root it at.']);
  });

  it('does nothing when the profile has no _files.json', () => {
    const { managers, open } = makeManagers();
    const notes: string[] = [];

    openProfileFiles('claude', managers, 'claude', notes);

    expect(open).not.toHaveBeenCalled();
    expect(notes).toEqual([]);
  });
});
