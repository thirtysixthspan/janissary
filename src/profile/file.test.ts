import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { initProfileDir, loadProfile } from '../profiles.js';
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
    writeJson('ok', { agents: [{ name: 'bob', active: false }], harnesses: [{ name: 'c', type: 'claude' }] });
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
    writeJson('a', { agents: [{ active: false }] });
    expect(loadProfile('a')).toHaveProperty('error');
  });

  it('errors when a harness entry lacks a string type', () => {
    writeJson('h', { harnesses: [{ name: 'c' }] });
    expect(loadProfile('h')).toHaveProperty('error');
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
    writeJson('x', { agents: [{ name: 'bob', active: false }], future: { anything: true } });
    expect('error' in loadProfile('x')).toBe(false);
  });

  it('maps layout.sidebar.left/right through to the flat fields', () => {
    writeJson('s', { layout: { sidebar: { left: 200, right: 210 } } });
    const loaded = loadProfile('s') as LoadedProfile;
    expect(loaded.layout).toEqual({ sidebarLeft: 200, sidebarRight: 210 });
  });

  it('loads editors and maps tab focus for agents and harnesses', () => {
    writeJson('editor', {
      agents: [{ name: 'agent', active: false, tab: { number: 2, focus: true } }],
      harnesses: [{ name: 'harness', type: 'claude', tab: { number: 1 } }],
      editors: [{ path: '$root/notes.md', line: 4 }],
    });
    const loaded = loadProfile('editor') as LoadedProfile;
    expect(loaded.editors).toEqual([{ path: '$root/notes.md', line: 4 }]);
    expect(loaded.entries).toEqual([
      expect.objectContaining({ name: 'harness', number: 1, focus: undefined }),
      expect.objectContaining({ name: 'agent', number: 2, focus: true }),
    ]);
  });
});
