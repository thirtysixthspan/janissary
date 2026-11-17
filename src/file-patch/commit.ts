import path from 'node:path';
import { fileOperationReason } from '../file-navigator/file-operation-result.js';
import type { PatchChanges } from './changes.js';
import { defaultCommitOperations, type CommitOperations } from './commit-operations.js';
import { restoreChanges, type UndoRecord } from './restore.js';

export type CommitOutcome = { ok: true } | { ok: false; restored: boolean; reason: string; path: string };

function folderPaths(changes: PatchChanges): Map<string, string> {
  const folders = new Set(changes.folders.map((folder) => path.resolve(folder)));
  const paths = new Map<string, string>();
  function add(location: string, requested: string): void {
    let folder = path.dirname(path.resolve(location));
    while (true) {
      if (folders.has(folder) && !paths.has(folder)) paths.set(folder, requested);
      const parent = path.dirname(folder);
      if (parent === folder) break;
      folder = parent;
    }
  }
  for (const move of changes.moves) add(move.to.location, move.to.requested);
  for (const write of changes.writes) {
    const place = write.finalPlace ?? write.place;
    add(place.location, place.requested);
  }
  return paths;
}

export function commitChanges(changes: PatchChanges, operations: CommitOperations = defaultCommitOperations): CommitOutcome {
  const records: UndoRecord[] = [];
  let reported = '';
  try {
    const paths = folderPaths(changes);
    for (const folder of changes.folders) {
      reported = paths.get(path.resolve(folder)) ?? '';
      operations.mkdir(folder);
      records.push({ kind: 'folder', path: folder });
    }
    for (const entry of changes.deletes) {
      reported = entry.place.requested;
      operations.unlink(entry.place.location);
      if (entry.linkText !== undefined) records.push({ kind: 'link', path: entry.place.location, target: entry.linkText });
      else if (entry.content.original !== undefined && entry.content.mode !== undefined) {
        records.push({ kind: 'delete', path: entry.place.location, bytes: entry.content.original, mode: entry.content.mode });
      }
    }
    for (const move of changes.moves) {
      reported = move.from.requested;
      operations.rename(move.from.location, move.to.location);
      records.push({ kind: 'rename', from: move.from.location, to: move.to.location });
    }
    for (const entry of changes.writes) {
      reported = entry.place.requested;
      const target = entry.finalPlace?.location ?? entry.content.realPath;
      operations.writeFile(target, Buffer.from(`${entry.bom ? '\u{FEFF}' : ''}${entry.text}`, 'utf8'));
      records.push({ kind: 'write', path: target, bytes: entry.content.original });
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, restored: restoreChanges(records, operations), reason: fileOperationReason(error), path: reported };
  }
}
