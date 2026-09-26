import { readFileSync } from 'node:fs';
import type { Managers } from '../managers.js';
import { contentHash, SAVE_CONFLICT_ERROR } from './save-conflict.js';

const BYTE_ORDER_MARK = String.fromCodePoint(0xFE_FF);

// Refuses a save whose buffer was built on content that is no longer on disk. `expectedHash` is
// the client's fingerprint of the text its buffer last matched; a different file on disk means
// something replaced it since — a git-sync pull, another process — and the buffer never saw it,
// whether or not the watcher managed to report it. The watcher is refreshed before refusing, so a
// change it missed reaches the tab now, and the client answers the refusal with its overwrite
// prompt. A file that is gone has nothing left to lose and is written as before.
//
// The browser reads a file with `response.text()`, which drops a leading UTF-8 byte-order mark,
// so the disk side drops it too before comparing.
export function refuseStaleSave(
  managers: Managers, label: string | undefined, filePath: string, expectedHash: string,
): void {
  let onDisk: string;
  try { onDisk = readFileSync(filePath, 'utf8'); } catch { return; }
  const text = onDisk.startsWith(BYTE_ORDER_MARK) ? onDisk.slice(BYTE_ORDER_MARK.length) : onDisk;
  if (contentHash(text) === expectedHash) return;
  if (label) managers.editorWatch.refresh(label);
  throw new Error(SAVE_CONFLICT_ERROR);
}
