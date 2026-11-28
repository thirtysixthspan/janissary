import { randomUUID } from 'node:crypto';
import { closeSync, fchmodSync, openSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';

export const OWNER_ONLY_FILE_MODE = 0o600;

function existingMode(file: string): number | undefined {
  try { return statSync(file).mode & 0o777; } catch { return undefined; }
}

function replaceAtomically(file: string, write: (temporary: string) => void): void {
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    write(temporary);
    renameSync(temporary, file);
  } catch (error) {
    try { rmSync(temporary, { force: true }); } catch { /* best-effort cleanup */ }
    throw error;
  }
}

// eslint-disable-next-line unicorn/no-non-function-verb-prefix -- `createMode` is a mode value, not a factory
export function atomicWriteFile(file: string, content: string | Uint8Array, createMode?: number): void {
  replaceAtomically(file, (temporary) => {
    const mode = existingMode(file) ?? createMode;
    writeFileSync(temporary, content, { mode });
  });
}

export function atomicWritePrivateFile(file: string, content: string | Uint8Array): void {
  replaceAtomically(file, (temporary) => {
    const descriptor = openSync(temporary, 'wx', OWNER_ONLY_FILE_MODE);
    try {
      fchmodSync(descriptor, OWNER_ONLY_FILE_MODE);
      writeFileSync(descriptor, content);
    } finally {
      closeSync(descriptor);
    }
  });
}
