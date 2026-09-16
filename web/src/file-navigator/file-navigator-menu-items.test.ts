import { describe, expect, it, vi } from 'vitest';
import type { FileNavigatorRow } from '@shared/protocol';
import { fileNavigatorMenuItems, type FileNavigatorMenuActions } from './file-navigator-menu-items';

const fileRow: FileNavigatorRow = { path: 'src/index.ts', name: 'index.ts', depth: 1, dir: false };
const directoryRow: FileNavigatorRow = { path: 'src', name: 'src', depth: 0, dir: true };
const parentRow: FileNavigatorRow = { path: '..', name: '..', depth: 0, dir: true };

function makeActions(): FileNavigatorMenuActions {
  return {
    open: vi.fn(),
    edit: vi.fn(),
    openWith: vi.fn(),
    copy: vi.fn(),
    copyFilePath: vi.fn(),
    paste: vi.fn(),
    duplicate: vi.fn(),
    rename: vi.fn(),
    remove: vi.fn(),
    commitToOrigin: vi.fn(),
    newFile: vi.fn(),
    newDirectory: vi.fn(),
  };
}

const labels = (groups: { label: string }[][]): string[][] =>
  groups.map((group) => group.map((item) => item.label));

describe('fileNavigatorMenuItems', () => {
  it('lists eleven entries in four groups for an ordinary file row', () => {
    expect(labels(fileNavigatorMenuItems(fileRow, true, makeActions()))).toEqual([
      ['Open', 'Edit', 'Open with'],
      ['Copy', 'Paste', 'Duplicate', 'Copy file path'],
      ['Rename', 'Delete'],
      ['New file', 'New folder'],
    ]);
  });

  it('draws a contributed selection entry in its own group above Copy', () => {
    const onActivate = vi.fn();
    const groups = fileNavigatorMenuItems(fileRow, true, makeActions(), {
      label: 'Add to playlist', onActivate,
    });
    expect(labels(groups)).toEqual([
      ['Open', 'Edit', 'Open with'],
      ['Add to playlist'],
      ['Copy', 'Paste', 'Duplicate', 'Copy file path'],
      ['Rename', 'Delete'],
      ['New file', 'New folder'],
    ]);
    groups[1][0].onActivate();
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it('leaves the single-row entries alone whether or not one is contributed', () => {
    const contributed = fileNavigatorMenuItems(fileRow, true, makeActions(), {
      label: 'Add to playlist', onActivate: vi.fn(),
    });
    const plain = fileNavigatorMenuItems(fileRow, true, makeActions(), null);
    expect(labels(contributed).filter((group) => group[0] !== 'Add to playlist'))
      .toEqual(labels(plain));
  });

  it('omits Paste when the clipboard is empty, but keeps Duplicate and Copy file path', () => {
    expect(labels(fileNavigatorMenuItems(fileRow, false, makeActions()))[1])
      .toEqual(['Copy', 'Duplicate', 'Copy file path']);
  });

  it('omits Edit on directories', () => {
    expect(labels(fileNavigatorMenuItems(directoryRow, true, makeActions()))[0])
      .toEqual(['Open', 'Open with']);
  });

  it('omits Open, Edit, Open with, Duplicate, Rename, and Copy file path on the ".." row', () => {
    expect(labels(fileNavigatorMenuItems(parentRow, true, makeActions()))).toEqual([
      ['Copy', 'Paste'],
      ['Delete'],
      ['New file', 'New folder'],
    ]);
  });

  it('appends Commit to origin to the Rename/Delete group when the tree has a branch', () => {
    const groups = fileNavigatorMenuItems(fileRow, true, makeActions(), null, true);
    expect(labels(groups)).toEqual([
      ['Open', 'Edit', 'Open with'],
      ['Copy', 'Paste', 'Duplicate'],
      ['Rename', 'Delete', 'Commit to origin'],
      ['New file', 'New folder'],
    ]);
  });

  it('offers Commit to origin on a directory row, where Edit is not offered', () => {
    expect(labels(fileNavigatorMenuItems(directoryRow, true, makeActions(), null, true))).toEqual([
      ['Open', 'Open with'],
      ['Copy', 'Paste', 'Duplicate'],
      ['Rename', 'Delete', 'Commit to origin'],
      ['New file', 'New folder'],
    ]);
  });

  it('omits Commit to origin on the ".." row and on a tree with no branch', () => {
    expect(labels(fileNavigatorMenuItems(parentRow, true, makeActions(), null, true))[1])
      .toEqual(['Delete']);
    expect(labels(fileNavigatorMenuItems(fileRow, true, makeActions(), null, false))[2])
      .toEqual(['Rename', 'Delete']);
  });

  it('routes Commit to origin to its action with the clicked row', () => {
    const actions = makeActions();
    const groups = fileNavigatorMenuItems(fileRow, true, actions, null, true);
    groups[2][2].onActivate();
    expect(actions.commitToOrigin).toHaveBeenCalledWith(fileRow);
  });

  it('routes each entry to its action with the clicked row', () => {
    const actions = makeActions();
    for (const group of fileNavigatorMenuItems(fileRow, true, actions)) {
      for (const item of group) item.onActivate();
    }
    expect(actions.open).toHaveBeenCalledWith(fileRow);
    expect(actions.edit).toHaveBeenCalledWith(fileRow);
    expect(actions.openWith).toHaveBeenCalledWith(fileRow);
    expect(actions.copy).toHaveBeenCalledWith(fileRow);
    expect(actions.copyFilePath).toHaveBeenCalledWith(fileRow);
    expect(actions.paste).toHaveBeenCalledWith(fileRow);
    expect(actions.duplicate).toHaveBeenCalledWith(fileRow);
    expect(actions.rename).toHaveBeenCalledWith(fileRow);
    expect(actions.remove).toHaveBeenCalledWith(fileRow);
    expect(actions.newFile).toHaveBeenCalled();
    expect(actions.newDirectory).toHaveBeenCalled();
  });
});
