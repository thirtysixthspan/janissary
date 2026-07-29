import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { initProfileDir } from '../profiles.js';
import { loadProfile } from './file.js';
import type { LoadedProfile } from '../types.js';

// The all-or-nothing single-file loader: a structurally invalid file yields `{ error }` and opens
// nothing (Decision 6); an unrecognized top-level key is ignored, not an error (Decision 3).
describe('loadProfile', () => {
  let root: string;

  const write = (name: string, contents: string) => {
    writeFileSync(path.join(root, 'profiles', `${name}.json`), contents);
  };
  const writeJson = (name: string, obj: unknown) => write(name, JSON.stringify(obj));

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'janus-proffile-'));
    initProfileDir(root);
    mkdirSync(path.join(root, 'profiles'), { recursive: true });
  });

  afterAll(() => {
    if (root) rmSync(root, { recursive: true, force: true });
  });

  it('returns a LoadedProfile for a valid file', () => {
    writeJson('ok', { tabs: [{ type: 'agent', name: 'bob', active: false }, { type: 'harness', name: 'c', tool: 'claude' }] });
    const loaded = loadProfile('ok');
    expect('error' in loaded).toBe(false);
    expect((loaded as LoadedProfile).entries.map((e) => e.name)).toEqual(['bob', 'c']);
  });

  it('errors on unparseable JSON', () => {
    write('bad', '{ not json');
    expect(loadProfile('bad')).toHaveProperty('error');
  });

  it('errors when the root is not an object', () => {
    writeJson('arr', [{ name: 'bob' }]);
    expect(loadProfile('arr')).toHaveProperty('error');
  });

  it('errors when an agent entry lacks a string name', () => {
    writeJson('a', { tabs: [{ type: 'agent', active: false }] });
    expect(loadProfile('a')).toHaveProperty('error');
  });

  it('errors when a harness entry lacks a string tool', () => {
    writeJson('h', { tabs: [{ type: 'harness', name: 'c' }] });
    expect(loadProfile('h')).toHaveProperty('error');
  });

  it('errors on an unrecognized tab type', () => {
    writeJson('t', { tabs: [{ type: 'terminal', name: 'c' }] });
    expect(loadProfile('t')).toHaveProperty('error');
  });

  it('errors on a bad element in a reserved section', () => {
    writeJson('m', { monitors: [{ persona: 'assistant', targets: 'group:1' }] });
    expect(loadProfile('m')).toHaveProperty('error');
  });

  it('errors on a malformed layout field', () => {
    writeJson('l', { layout: { window: { width: '1440', height: 900 } } });
    expect(loadProfile('l')).toHaveProperty('error');
  });

  it('ignores an unrecognized top-level key', () => {
    writeJson('x', { tabs: [{ type: 'agent', name: 'bob', active: false }], future: { anything: true } });
    expect('error' in loadProfile('x')).toBe(false);
  });

  it('loads an old-format file as a profile with no tabs, since its keys are now unrecognized', () => {
    writeJson('old', { agents: [{ name: 'bob', active: false }], harnesses: [{ name: 'c', type: 'claude' }] });
    const loaded = loadProfile('old') as LoadedProfile;
    expect(loaded.entries).toEqual([]);
    expect(loaded.editors).toEqual([]);
  });

  it('maps layout.sidebar.left/right through to the flat fields', () => {
    writeJson('s', { layout: { sidebar: { left: 200, right: 210 } } });
    const loaded = loadProfile('s') as LoadedProfile;
    expect(loaded.layout).toEqual({ sidebarLeft: 200, sidebarRight: 210 });
  });

  it('loads editors and maps tab focus for agents and harnesses', () => {
    writeJson('editor', {
      tabs: [
        { type: 'agent', name: 'agent', active: false, number: 2, focus: true },
        { type: 'harness', name: 'harness', tool: 'claude', number: 1 },
        { type: 'editor', path: '$root/notes.md', line: 4 },
      ],
    });
    const loaded = loadProfile('editor') as LoadedProfile;
    expect(loaded.editors).toEqual([expect.objectContaining({ path: '$root/notes.md', line: 4 })]);
    expect(loaded.entries).toEqual([
      expect.objectContaining({ name: 'harness', number: 1, focus: undefined }),
      expect.objectContaining({ name: 'agent', number: 2, focus: true }),
    ]);
  });

  it('maps pane placement and leaves missing pane values for the launch default', () => {
    writeJson('panes', {
      tabs: [
        { type: 'agent', name: 'agent', pane: 'left' },
        { type: 'harness', name: 'harness', tool: 'claude', pane: 'right' },
        { type: 'editor', path: 'notes.md', pane: 'right' },
      ],
    });
    const loaded = loadProfile('panes') as LoadedProfile;
    expect(loaded.entries).toEqual([
      expect.objectContaining({ name: 'agent', pane: 'left' }),
      expect.objectContaining({ name: 'harness', pane: 'right' }),
    ]);
    expect(loaded.editors[0]?.pane).toBe('right');
  });

  it('partitions one tabs array into every per-kind list', () => {
    writeJson('all', {
      tabs: [
        { type: 'agent', name: 'agent', active: false },
        { type: 'harness', name: 'harness', tool: 'claude' },
        { type: 'editor', path: 'notes.md' },
        { type: 'files', dock: 'left', path: '$root' },
        { type: 'notifications', dock: 'right', focus: true },
        { type: 'schedules', dock: 'right' },
        { type: 'image', path: 'a.png' },
        { type: 'markdown', path: 'readme.md' },
        { type: 'page', url: 'https://example.com/' },
        { type: 'ssh', destination: 'host', options: ['-p', '2222'] },
      ],
    });
    const loaded = loadProfile('all') as LoadedProfile;
    expect(loaded.entries.map((e) => e.name)).toEqual(['agent', 'harness']);
    expect(loaded.editors).toEqual([expect.objectContaining({ path: 'notes.md' })]);
    expect(loaded.files).toEqual([{ dock: 'left', path: '$root' }]);
    expect(loaded.notifications).toEqual([{ dock: 'right', focus: true }]);
    expect(loaded.schedules).toEqual([{ dock: 'right' }]);
    expect(loaded.views.map((v) => v.type)).toEqual(['image', 'markdown', 'page', 'ssh']);
    expect(loaded.views[3]).toEqual(expect.objectContaining({ destination: 'host', options: ['-p', '2222'] }));
  });

  it('maps color to dotColor and leaves the other presentation fields flat', () => {
    writeJson('flat', {
      tabs: [{ type: 'agent', name: 'bob', color: '#aaa', number: 2, group: 3, groupColor: '#bbb', pane: 'right' }],
    });
    const loaded = loadProfile('flat') as LoadedProfile;
    expect(loaded.entries[0]).toEqual(expect.objectContaining({
      dotColor: '#aaa', number: 2, group: 3, groupColor: '#bbb', pane: 'right',
    }));
  });

  it('reaches ProfileHarnessEntry.tool from a harness element', () => {
    writeJson('tool', { tabs: [{ type: 'harness', name: 'c', tool: 'opencode' }] });
    const entry = (loadProfile('tool') as LoadedProfile).entries[0];
    expect('tool' in entry && entry.tool).toBe('opencode');
  });

  it('sorts entries by number, unnumbered last and in array order among themselves', () => {
    writeJson('order', {
      tabs: [
        { type: 'agent', name: 'unnumbered-first' },
        { type: 'agent', name: 'numbered', number: 1 },
        { type: 'agent', name: 'unnumbered-second' },
      ],
    });
    const loaded = loadProfile('order') as LoadedProfile;
    expect(loaded.entries.map((e) => e.name)).toEqual(['numbered', 'unnumbered-first', 'unnumbered-second']);
  });
});
