import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { tabPluginCatalog } from '../../plugins/catalog.js';
import { fileNavigatorSelectionAction, runFileNavigatorSelectionAction } from './navigator-selection.js';
import type { Managers } from '../../managers.js';

// A tree holding two file types the bundled plugins claim: audio contributes a selection action,
// image does not. The rows arrive tree-relative, so the tree has to exist on disk.
function makeTree() {
  const root = mkdtempSync(path.join(tmpdir(), 'janus-navigator-selection-'));
  for (const name of ['a.mp3', 'b.flac', 'cover.png']) writeFileSync(path.join(root, name), 'x');
  return root;
}

// A managers mock carrying only what the selection RPCs read: the tab at `index`, the root that
// tab's navigator holds, the plugin declarations, and the host's selection-action entry point.
function makeManagers(
  tabLabel: string | undefined,
  root: string | undefined,
  runSelectionAction: (...args: unknown[]) => unknown = () => {},
) {
  return {
    tab: { tabs: tabLabel === undefined ? [] : [{ label: tabLabel }] },
    fileNavigator: { rootOf: () => root },
    plugins: { declarations: tabPluginCatalog, runSelectionAction },
  } as unknown as Managers;
}

describe('controller-file-navigator-selection', () => {
  it('fileNavigatorSelectionAction offers the tab label and the action the owning plugin contributed', () => {
    const root = makeTree();
    const managers = makeManagers('agent', root);
    expect(fileNavigatorSelectionAction(managers, 0, ['a.mp3', 'b.flac'])).toEqual({
      label: 'Add to playlist',
      action: 'queue',
    });
  });

  it('fileNavigatorSelectionAction offers nothing when the tab index has no label', () => {
    const managers = makeManagers(undefined, makeTree());
    expect(fileNavigatorSelectionAction(managers, 0, ['a.mp3'])).toBeNull();
  });

  // The label resolves, but the navigator behind it holds no root — a tab that closed between the
  // client drawing the menu and the RPC arriving, or one never rooted at all.
  it('fileNavigatorSelectionAction offers nothing when the label names no navigator root', () => {
    const managers = makeManagers('agent', undefined);
    expect(fileNavigatorSelectionAction(managers, 0, ['a.mp3'])).toBeNull();
  });

  it('fileNavigatorSelectionAction offers nothing when no single plugin owns the whole selection', () => {
    const managers = makeManagers('agent', makeTree());
    expect(fileNavigatorSelectionAction(managers, 0, ['a.mp3', 'cover.png'])).toBeNull();
  });

  it('runFileNavigatorSelectionAction hands the host the plugin, action, paths, and the menu origin', () => {
    const root = makeTree();
    const runSelectionAction = vi.fn(async () => {});
    const managers = makeManagers('agent', root, runSelectionAction);

    runFileNavigatorSelectionAction(managers, 0, ['a.mp3', 'b.flac'], 'queue');

    expect(runSelectionAction).toHaveBeenCalledWith(
      'audio',
      'queue',
      [path.join(root, 'a.mp3'), path.join(root, 'b.flac')],
      { label: 'agent', command: 'Add to playlist' },
    );
  });

  it('runFileNavigatorSelectionAction runs nothing when the tab index has no label', () => {
    const runSelectionAction = vi.fn(async () => {});
    const managers = makeManagers(undefined, makeTree(), runSelectionAction);
    runFileNavigatorSelectionAction(managers, 0, ['a.mp3'], 'queue');
    expect(runSelectionAction).not.toHaveBeenCalled();
  });
});
