import { describe, expect, it, vi } from 'vitest';
import type { FileNavigatorRow } from '@shared/protocol';
import type { JanusClient } from '../../shared/ws/ws';
import { createFileNavigatorActions } from './navigator-menu-actions';

const rows: FileNavigatorRow[] = [
  { path: 'src', name: 'src', depth: 0, dir: true, expanded: true },
  { path: 'src/a.ts', name: 'a.ts', depth: 1, dir: false },
  { path: 'src/b.ts', name: 'b.ts', depth: 1, dir: false },
  { path: 'README.md', name: 'README.md', depth: 0, dir: false },
];

function setup(reply = 'src/untitled') {
  const send = vi.fn();
  const request = vi.fn().mockResolvedValue({ ok: true, value: reply });
  const open = vi.fn();
  const onRowDoubleClick = vi.fn();
  const remove = vi.fn();
  const commit = vi.fn();
  const setPendingNewDir = vi.fn();
  const actions = createFileNavigatorActions({
    files: { root: '/ws', absoluteRoot: '/ws', rows },
    client: { send, request } as unknown as JanusClient,
    index: 0,
    label: 'files',
    selection: {
      cursor: 'src',
      selected: new Set(['src/a.ts', 'src/b.ts']),
      operationPaths: ['src/a.ts', 'src/b.ts'],
    },
    opener: { open, openWith: vi.fn() },
    paste: { paste: vi.fn(), duplicate: vi.fn() },
    deletion: { request: remove },
    rename: { begin: vi.fn() },
    rowEvents: { onRowDoubleClick },
    commit: { request: commit },
    multiOpenSelection: null,
    setPendingNewDir,
  });
  return { actions, send, request, open, onRowDoubleClick, remove, commit, setPendingNewDir };
}

describe('createFileNavigatorActions', () => {
  it('uses the selection when the clicked row belongs to it and the clicked row otherwise', () => {
    const { actions, remove, commit } = setup();
    actions.menuActions.remove(rows[1]);
    actions.menuActions.remove(rows[3]);
    actions.menuActions.commitToOrigin(rows[1]);
    actions.menuActions.commitToOrigin(rows[3]);
    expect(remove.mock.calls).toEqual([[['src/a.ts', 'src/b.ts']], [['README.md']]]);
    expect(commit.mock.calls).toEqual([[['src/a.ts', 'src/b.ts']], [['README.md']]]);
  });

  it('opens every selected path when the clicked row is in the multi-open set', () => {
    const h = setup();
    const multi = createFileNavigatorActions({
      files: { root: '/ws', absoluteRoot: '/ws', rows },
      client: { send: h.send } as unknown as JanusClient,
      index: 0,
      label: 'files',
      selection: { cursor: null, selected: new Set(), operationPaths: [] },
      opener: { open: h.open, openWith: vi.fn() },
      paste: { paste: vi.fn(), duplicate: vi.fn() },
      deletion: { request: vi.fn() },
      rename: { begin: vi.fn() },
      rowEvents: { onRowDoubleClick: h.onRowDoubleClick },
      commit: { request: vi.fn() },
      multiOpenSelection: ['src/a.ts', 'src/b.ts'],
      setPendingNewDir: vi.fn(),
    });
    multi.menuActions.open(rows[1]);
    expect(h.open.mock.calls).toEqual([['src/a.ts', false], ['src/b.ts', false]]);
    expect(h.onRowDoubleClick).not.toHaveBeenCalled();
  });

  it('selects a new directory only when the server reply matches its expected path', async () => {
    const h = setup();
    h.actions.createNewDirectory();
    await Promise.resolve();
    expect(h.request).toHaveBeenCalledWith({
      method: 'fileNavigatorCreateDirectory', params: { label: 'files', destination: 'src' },
    });
    expect(h.setPendingNewDir).toHaveBeenCalledWith('src/untitled');

    const mismatch = setup('src/untitled-2');
    mismatch.actions.createNewDirectory();
    await Promise.resolve();
    expect(mismatch.setPendingNewDir).not.toHaveBeenCalled();
  });
});
