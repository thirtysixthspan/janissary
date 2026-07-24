import { describe, it, expect } from 'vitest';
import type { FileTreeRow } from '@shared/protocol';
import { resolveDropTarget } from './file-navigator-drag';

function makeRows(): FileTreeRow[] {
  return [
    { path: '..', name: '..', depth: 0, dir: true },
    { path: 'src', name: 'src', depth: 0, dir: true, expanded: true },
    { path: 'src/nested', name: 'nested', depth: 1, dir: true, expanded: false },
    { path: 'src/index.ts', name: 'index.ts', depth: 1, dir: false },
    { path: 'src/other.ts', name: 'other.ts', depth: 1, dir: false },
    { path: 'dest', name: 'dest', depth: 0, dir: true, expanded: true },
    { path: 'dest/index.ts', name: 'index.ts', depth: 1, dir: false },
    { path: 'README.md', name: 'README.md', depth: 0, dir: false },
    { path: 'LICENSE', name: 'LICENSE', depth: 0, dir: false },
  ];
}

describe('resolveDropTarget', () => {
  it('is a valid, non-conflicting target for a directory row with no matching child', () => {
    const target = resolveDropTarget(makeRows(), 'src/index.ts', 'src/nested');
    expect(target).toEqual({ path: 'src/nested', conflict: false });
  });

  it('flags a conflict when the destination already has a child with the same name', () => {
    const target = resolveDropTarget(makeRows(), 'src/index.ts', 'dest');
    expect(target).toEqual({ path: 'dest', conflict: true });
  });

  it('resolves a file row to its parent directory', () => {
    const target = resolveDropTarget(makeRows(), 'README.md', 'src/index.ts');
    expect(target).toEqual({ path: 'src', conflict: false });
  });

  it('flags a conflict when hovering a file whose parent already has a matching child', () => {
    const target = resolveDropTarget(makeRows(), 'src/index.ts', 'dest/index.ts');
    expect(target).toEqual({ path: 'dest', conflict: true });
  });

  it('resolves a root-level file row to the root itself', () => {
    const target = resolveDropTarget(makeRows(), 'src/index.ts', 'README.md');
    expect(target).toEqual({ path: '', conflict: false });
  });

  it('is null when hovering the dragged item itself, whether a directory or a file', () => {
    expect(resolveDropTarget(makeRows(), 'src', 'src')).toBeNull();
    expect(resolveDropTarget(makeRows(), 'src/index.ts', 'src/index.ts')).toBeNull();
  });

  it('is null when hovering a descendant of the dragged directory', () => {
    expect(resolveDropTarget(makeRows(), 'src', 'src/nested')).toBeNull();
  });

  it("is null when hovering another row already inside the dragged item's own directory", () => {
    expect(resolveDropTarget(makeRows(), 'dest/index.ts', 'dest')).toBeNull();
  });

  it("is null when hovering a sibling file inside the dragged item's own directory", () => {
    expect(resolveDropTarget(makeRows(), 'src/index.ts', 'src/other.ts')).toBeNull();
  });

  it('is null when hovering another root-level row and the dragged item is also root-level', () => {
    expect(resolveDropTarget(makeRows(), 'README.md', 'LICENSE')).toBeNull();
  });

  it('is null when hovering the ".." row', () => {
    expect(resolveDropTarget(makeRows(), 'README.md', '..')).toBeNull();
  });

  it('is null when not hovering any row', () => {
    expect(resolveDropTarget(makeRows(), 'README.md', null)).toBeNull();
  });
});
