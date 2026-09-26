import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createFileNavigatorControllerAdapter } from './navigator-adapter.js';
import { tabPluginCatalog } from '../../plugins/catalog.js';
import { requestTreeSelections } from '../../file-navigator/selection-request.js';
import { messageBus } from '../../bus.js';
import { NOTIFICATIONS_LABEL } from '../../notifications/tab.js';
import { NotificationQueue } from '../../notifications/queue.js';
import type { Managers } from '../../managers.js';

// The adapter is pure wiring: it binds one `Managers` and forwards each RPC's arguments, in order, to
// the manager call behind it. These tests therefore drive the real RPC layer and assert on the
// manager calls it lands on — no module mocks, so the forwarding is checked end to end.
function makeManagers(tree?: string) {
  // The batch calls report a result the RPC layer inspects for a conflict, so a vi.fn() returning
  // nothing would not stand in for them.
  const batch = (...args: unknown[]) => ({ total: (args[1] as string[]).length, failedPaths: [] });
  const fileNavigator = {
    pull: vi.fn(), commit: vi.fn(), setDetail: vi.fn(), moveMany: vi.fn(batch), paste: vi.fn(batch),
    deleteMany: vi.fn(batch), rename: vi.fn(batch), search: vi.fn(async () => ['a.ts']), reveal: vi.fn(),
    openers: vi.fn(() => ({ command: 'edit', choices: [{ id: 'a.ts' }] })),
    openFile: vi.fn(() => 'opened'), createFile: vi.fn(), createDirectory: vi.fn(() => 'src/new'),
    redo: vi.fn(() => ({})),
  };
  const runSelectionAction = vi.fn(async () => {});
  const append = vi.fn();
  const active = { label: 'agent', dotColor: 'blue', log: [] };
  const notifications = { label: NOTIFICATIONS_LABEL, view: 'notifications', log: [] };
  const tabs = [active, notifications];
  const managers = {
    tab: { tabs, cur: () => active, byLabel: () => active, append },
    fileNavigator: tree === undefined ? fileNavigator : { ...fileNavigator, rootOf: () => tree },
    plugins: { declarations: tabPluginCatalog, runSelectionAction },
    notifications: new NotificationQueue(),
  } as unknown as Managers;
  return { managers, fileNavigator, append, runSelectionAction };
}

function makeTree() {
  const root = mkdtempSync(path.join(tmpdir(), 'janus-navigator-adapter-'));
  writeFileSync(path.join(root, 'a.mp3'), 'x');
  return root;
}

describe('createFileNavigatorControllerAdapter', () => {
  it('forwards the pull, commit, and detail RPCs to the navigator behind the tab at the index', () => {
    const { managers, fileNavigator } = makeManagers();
    const adapter = createFileNavigatorControllerAdapter(managers);

    adapter.fileNavigatorPull(0);
    adapter.fileNavigatorCommit(0, 'commit: a.md', ['a.md']);
    adapter.fileNavigatorSetDetail(0, { open: false });

    expect(fileNavigator.pull).toHaveBeenCalledWith('agent');
    expect(fileNavigator.commit).toHaveBeenCalledWith('agent', 'commit: a.md', ['a.md']);
    expect(fileNavigator.setDetail).toHaveBeenCalledWith('agent', { open: false });
  });

  it('reports a nothing-to-commit as the notifications line the commit would have posted', () => {
    const { managers, append } = makeManagers();
    createFileNavigatorControllerAdapter(managers).fileNavigatorNothingToCommit(0);
    expect(append).toHaveBeenCalledWith(
      NOTIFICATIONS_LABEL,
      expect.objectContaining({ output: 'Nothing to commit' }),
      expect.any(Number),
    );
  });

  it('forwards the multi-path, paste, delete-many, rename, and redo calls in argument order', () => {
    const { managers, fileNavigator } = makeManagers();
    const adapter = createFileNavigatorControllerAdapter(managers);

    adapter.moveFileNavigatorItems('agent', ['a'], 'dest', 'overwrite-all');
    adapter.pasteFileNavigatorItems('agent', ['/x/a'], 'dest', 'copy', 'skip-conflicts', 'other');
    adapter.deleteFileNavigatorItems('agent', ['a', 'b']);
    adapter.renameFileNavigatorItem('agent', 'a.ts', 'b.ts');
    adapter.redoFileNavigatorItem('agent', true, true);

    expect(fileNavigator.moveMany).toHaveBeenCalledWith('agent', ['a'], 'dest', 'overwrite-all');
    expect(fileNavigator.paste).toHaveBeenCalledWith('agent', ['/x/a'], 'dest', 'copy', 'skip-conflicts', 'other');
    expect(fileNavigator.deleteMany).toHaveBeenCalledWith('agent', ['a', 'b']);
    expect(fileNavigator.rename).toHaveBeenCalledWith('agent', 'a.ts', 'b.ts');
    expect(fileNavigator.redo).toHaveBeenCalledWith('agent', true, true);
  });

  it('forwards the index-scoped reads and hands their results back to the caller', async () => {
    const { managers, fileNavigator } = makeManagers();
    const adapter = createFileNavigatorControllerAdapter(managers);

    expect(await adapter.fileNavigatorSearch(0)).toEqual(['a.ts']);
    expect(adapter.fileNavigatorOpeners(0, 'a.ts', true, false)).toEqual({ command: 'edit', choices: [{ id: 'a.ts' }] });
    expect(adapter.fileNavigatorOpen(0, 'a.ts', 'edit')).toBe('opened');
    adapter.revealFileNavigatorItem(0, 'a.ts');

    expect(fileNavigator.search).toHaveBeenCalledWith('agent');
    expect(fileNavigator.openers).toHaveBeenCalledWith('agent', 'a.ts', true, false);
    expect(fileNavigator.openFile).toHaveBeenCalledWith('agent', 'a.ts', 'edit');
    expect(fileNavigator.reveal).toHaveBeenCalledWith('agent', 'a.ts');
  });

  it('forwards the create calls to the manager by navigator label', () => {
    const { managers, fileNavigator } = makeManagers();
    const adapter = createFileNavigatorControllerAdapter(managers);

    adapter.fileNavigatorCreateFile('agent', 'src/new.ts');
    expect(adapter.fileNavigatorCreateDirectory('agent', 'src')).toBe('src/new');

    expect(fileNavigator.createFile).toHaveBeenCalledWith('agent', 'src/new.ts');
    expect(fileNavigator.createDirectory).toHaveBeenCalledWith('agent', 'src');
  });

  it('forwards the selection-action pair to the navigator root behind the tab', () => {
    const root = makeTree();
    const { managers, runSelectionAction } = makeManagers(root);
    const adapter = createFileNavigatorControllerAdapter(managers);

    expect(adapter.fileNavigatorSelectionAction(0, ['a.mp3']))
      .toEqual({ label: 'Add to playlist', action: 'queue' });
    adapter.runFileNavigatorSelectionAction(0, ['a.mp3'], 'queue');

    expect(runSelectionAction).toHaveBeenCalledWith(
      'audio', 'queue', [path.join(root, 'a.mp3')], { label: 'agent', command: 'Add to playlist' },
    );
  });

  // The save-time round trip: the client answers the id the request went out with, and the adapter
  // has to hand that id through untouched or the answer lands on nothing.
  it('settles the outstanding tree-selection request with the client records', async () => {
    const { managers } = makeManagers();
    let id = 0;
    const subscription = messageBus.on('fileNavigator', 'collect', (event) => { id = event.id; });
    const selections = requestTreeSelections(50);
    subscription.unsubscribe();

    createFileNavigatorControllerAdapter(managers)
      .reportFileNavigatorSelection(id, [{ index: 0, cursor: 'a.ts', selected: ['a.ts'] }]);

    expect(await selections).toEqual(new Map([[0, { cursor: 'a.ts', anchor: undefined, selected: ['a.ts'] }]]));
  });
});
