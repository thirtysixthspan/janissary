import { lstatSync, mkdirSync, readFileSync, readlinkSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { replaceFileAtomically } from '../files.js';

const MAX_BYTES = 1024 * 1024;
const TARGET_MODE = 0o600;
const PARENT_MODE = 0o700;

type ReadResult = { text: string; problem?: string };
type WriteResult = { problem?: string };

function problemFor(error: unknown): string {
  if (error instanceof Error && 'code' in error) {
    if (error.code === 'ENOENT') return 'no such file';
    if (error.code === 'EISDIR') return 'is a directory';
    if (error.code === 'EACCES') return 'permission denied';
  }
  return 'could not be read';
}

export function readSshConfigFile(filePath: string): ReadResult {
  try {
    if (statSync(filePath).size > MAX_BYTES) return { text: '', problem: 'file is too large' };
    return { text: readFileSync(filePath, 'utf8') };
  } catch (error) {
    return { text: '', problem: problemFor(error) };
  }
}

export function writeSshConfigFile(filePath: string, content: string): WriteResult {
  try {
    const parent = path.dirname(filePath);
    mkdirSync(parent, { recursive: true, mode: PARENT_MODE });
    let target = path.join(realpathSync(parent), path.basename(filePath));
    try {
      if (lstatSync(target).isSymbolicLink()) {
        try {
          target = realpathSync(target);
        } catch (error) {
          if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
            const resolved = path.resolve(path.dirname(target), readlinkSync(target));
            mkdirSync(path.dirname(resolved), { recursive: true, mode: PARENT_MODE });
            target = resolved;
          }
        }
      }
    } catch { /* a missing destination is written at its requested path */ }
    replaceFileAtomically(target, Buffer.from(content, 'utf8'), TARGET_MODE);
    return {};
  } catch (error) {
    return { problem: problemFor(error) };
  }
}
