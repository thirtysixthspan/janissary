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
    paste: vi.fn(),
    rename: vi.fn(),
    remove: vi.fn(),
    newFile: vi.fn(),
    newDirectory: vi.fn(),
  };
}

const labels = (groups: { label: string }[][]): string[][] =>
  groups.map((group) => group.map((item) => item.label));

describe('fileNavigatorMenuItems', () => {
  it('lists nine entries in four groups for an ordinary file row', () => {
    expect(labels(fileNavigatorMenuItems(fileRow, true, makeActions()))).toEqual([
      ['Open', 'Edit', 'Open with'],
      ['Copy', 'Paste'],
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
      ['Copy', 'Paste'],
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

  it('omits Paste when the clipboard is empty', () => {
    expect(labels(fileNavigatorMenuItems(fileRow, false, makeActions()))[1]).toEqual(['Copy']);
  });

  it('omits Edit on directories', () => {
    expect(labels(fileNavigatorMenuItems(directoryRow, true, makeActions()))[0])
      .toEqual(['Open', 'Open with']);
  });

  it('omits Open, Edit, Open with, and Rename on the ".." row', () => {
    expect(labels(fileNavigatorMenuItems(parentRow, true, makeActions()))).toEqual([
      ['Copy', 'Paste'],
      ['Delete'],
      ['New file', 'New folder'],
    ]);
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
    expect(actions.paste).toHaveBeenCalledWith(fileRow);
    expect(actions.rename).toHaveBeenCalledWith(fileRow);
    expect(actions.remove).toHaveBeenCalledWith(fileRow);
    expect(actions.newFile).toHaveBeenCalled();
    expect(actions.newDirectory).toHaveBeenCalled();
  });
});
