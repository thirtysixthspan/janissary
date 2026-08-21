import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { tabPluginCatalog } from '../plugins/catalog.js';
import { resolveSelectionPaths, selectionActionFor } from './selection-action.js';

// A tree with the file types the bundled plugins claim: audio contributes a selection action, image
// does not, and `notes.txt` belongs to core's editor opener.
function makeTree() {
  const root = mkdtempSync(path.join(tmpdir(), 'janus-selection-'));
  for (const name of ['a.mp3', 'b.flac', 'cover.png', 'notes.txt']) {
    writeFileSync(path.join(root, name), 'x');
  }
  mkdirSync(path.join(root, 'album'));
  writeFileSync(path.join(root, 'album', 'c.mp3'), 'x');
  return root;
}

const declarations = tabPluginCatalog;

describe('selectionActionFor', () => {
  it('offers the contributed entry for a selection of one plugin\'s own file types', () => {
    const root = makeTree();
    const match = selectionActionFor(declarations, root, ['a.mp3', 'b.flac', 'album/c.mp3']);
    expect(match).toMatchObject({ plugin: 'audio', label: 'Add to playlist', action: 'queue' });
    expect(match?.paths).toEqual([
      path.join(root, 'a.mp3'), path.join(root, 'b.flac'), path.join(root, 'album', 'c.mp3'),
    ]);
  });

  it('offers nothing for a selection that mixes two plugins\' file types', () => {
    const root = makeTree();
    expect(selectionActionFor(declarations, root, ['a.mp3', 'cover.png'])).toBeNull();
  });

  it('offers nothing when the selection contains a directory', () => {
    const root = makeTree();
    expect(selectionActionFor(declarations, root, ['a.mp3', 'album'])).toBeNull();
  });

  it('offers nothing for an empty selection', () => {
    expect(selectionActionFor(declarations, makeTree(), [])).toBeNull();
  });

  it('offers nothing when the owning plugin contributes no selection action', () => {
    const root = makeTree();
    expect(selectionActionFor(declarations, root, ['cover.png'])).toBeNull();
  });

  it('offers nothing for files core owns rather than any plugin', () => {
    const root = makeTree();
    expect(selectionActionFor(declarations, root, ['notes.txt'])).toBeNull();
  });

  // Opening a context menu is not a use of a plugin, so resolving reads the declarations alone. The
  // catalog is static data with no activation behind it, which is what makes that true by shape.
  it('resolves from declarations alone, never reaching a plugin activation', () => {
    const root = makeTree();
    const declared = [...declarations].map((declaration) => ({ ...declaration }));
    expect(selectionActionFor(declared, root, ['a.mp3'])?.plugin).toBe('audio');
  });
});

describe('resolveSelectionPaths', () => {
  it('resolves tree-relative rows against the navigator root', () => {
    const root = makeTree();
    expect(resolveSelectionPaths(root, ['a.mp3'])).toEqual([path.join(root, 'a.mp3')]);
  });

  it('refuses the whole selection when one path escapes the root', () => {
    const root = makeTree();
    expect(resolveSelectionPaths(root, ['a.mp3', '../outside.mp3'])).toEqual([]);
    expect(selectionActionFor(declarations, root, ['a.mp3', '../outside.mp3'])).toBeNull();
  });

  it('refuses a path that does not exist', () => {
    const root = makeTree();
    expect(resolveSelectionPaths(root, ['gone.mp3'])).toEqual([]);
  });
});
