import { describe, expect, it, vi } from 'vitest';
import type { FileNavigatorRow } from '@shared/protocol';
import { fileNavigatorMenuItems, type FileNavigatorMenuActions } from './file-navigator-menu-items';

const fileRow: FileNavigatorRow = { path: 'src/index.ts', name: 'index.ts', depth: 1, dir: false };
const parentRow: FileNavigatorRow = { path: '..', name: '..', depth: 0, dir: true };

function makeActions(): FileNavigatorMenuActions {
  return {
    open: vi.fn(),
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
  it('lists eight entries in four groups for an ordinary file row', () => {
    expect(labels(fileNavigatorMenuItems(fileRow, true, makeActions()))).toEqual([
      ['Open', 'Open with'],
      ['Copy', 'Paste'],
      ['Rename', 'Delete'],
      ['New file', 'New folder'],
    ]);
  });

  it('omits Paste when the clipboard is empty', () => {
    expect(labels(fileNavigatorMenuItems(fileRow, false, makeActions()))[1]).toEqual(['Copy']);
  });

  it('omits Open, Open with, and Rename on the ".." row', () => {
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
    expect(actions.openWith).toHaveBeenCalledWith(fileRow);
    expect(actions.copy).toHaveBeenCalledWith(fileRow);
    expect(actions.paste).toHaveBeenCalledWith(fileRow);
    expect(actions.rename).toHaveBeenCalledWith(fileRow);
    expect(actions.remove).toHaveBeenCalledWith(fileRow);
    expect(actions.newFile).toHaveBeenCalled();
    expect(actions.newDirectory).toHaveBeenCalled();
  });
});
