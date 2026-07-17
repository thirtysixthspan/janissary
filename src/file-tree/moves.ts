import path from 'node:path';
import { renameSync } from 'node:fs';
import { hasNameConflict } from './index.js';

// One past move: the item's tree-relative path before (`from`) and after (`to`) the move. Enough
// to reverse it (move `to` back to `from`'s directory) or re-apply it (move `from` to `to`'s
// directory) without recomputing anything from disk.
export type MoveEntry = { from: string; to: string };

// Reported by `undo`/`redo` when the destination is already occupied: neither stack is mutated, so
// a caller-driven overwrite (passing `overwrite: true`) can retry the same pending entry.
export type UndoRedoResult = { conflict?: { fromRelPath: string; toRelPath: string } };

// Shared reverse/re-apply logic for `undo`/`redo`: moves `sourceRel` (relative to `root`) into
// `destDir`, unless the destination already has a same-named entry and the caller hasn't confirmed
// an overwrite, in which case it reports the conflict and leaves both stacks untouched. On success
// it pops `fromStack`, pushes `entry` onto `toStack`, and invokes `rebuild`.
export function applyStackMove(
  root: string,
  sourceRel: string,
  destDir: string,
  entry: MoveEntry,
  fromStack: MoveEntry[],
  toStack: MoveEntry[],
  overwrite: boolean,
  rebuild: () => void,
): UndoRedoResult {
  const sourceAbs = path.join(root, sourceRel);
  const name = path.basename(sourceAbs);
  const destAbsDir = path.join(root, destDir);
  const destAbs = path.join(destAbsDir, name);
  if (!overwrite && sourceAbs !== destAbs && hasNameConflict(destAbsDir, name)) {
    return { conflict: { fromRelPath: sourceRel, toRelPath: destDir } };
  }
  try { renameSync(sourceAbs, destAbs); } catch { return {}; }
  fromStack.pop();
  toStack.push(entry);
  rebuild();
  return {};
}
