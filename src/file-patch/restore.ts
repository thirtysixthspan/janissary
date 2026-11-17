import type { CommitOperations } from './commit-operations.js';

export type UndoRecord =
  | { kind: 'folder'; path: string }
  | { kind: 'delete'; path: string; bytes: Buffer; mode: number }
  | { kind: 'link'; path: string; target: string }
  | { kind: 'rename'; from: string; to: string }
  | { kind: 'write'; path: string; bytes: Buffer | undefined };

function undo(record: UndoRecord, operations: CommitOperations): void {
  switch (record.kind) {
    case 'folder': { operations.rmdir(record.path); break; }
    case 'delete': { operations.writeFile(record.path, record.bytes); operations.chmod(record.path, record.mode); break; }
    case 'link': { operations.symlink(record.target, record.path); break; }
    case 'rename': { operations.rename(record.to, record.from); break; }
    case 'write': {
      if (record.bytes === undefined) operations.unlink(record.path);
      else operations.writeFile(record.path, record.bytes);
      break;
    }
  }
}

export function restoreChanges(records: readonly UndoRecord[], operations: CommitOperations): boolean {
  let restored = true;
  for (let index = records.length - 1; index >= 0; index -= 1) {
    const record = records[index];
    try { undo(record, operations); } catch (error) {
      const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
      if (record.kind !== 'folder' || (code !== 'ENOTEMPTY' && code !== 'EEXIST')) restored = false;
    }
  }
  return restored;
}
