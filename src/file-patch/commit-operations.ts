import { chmodSync, mkdirSync, renameSync, rmdirSync, symlinkSync, unlinkSync } from 'node:fs';
import { atomicWriteFile } from '../atomic-write.js';

export interface CommitOperations {
  mkdir(path: string): void;
  writeFile(path: string, content: Uint8Array): void;
  unlink(path: string): void;
  rename(from: string, to: string): void;
  rmdir(path: string): void;
  symlink(target: string, path: string): void;
  chmod(path: string, mode: number): void;
}

export const defaultCommitOperations: CommitOperations = {
  mkdir: mkdirSync, writeFile: atomicWriteFile, unlink: unlinkSync, rename: renameSync,
  rmdir: rmdirSync, symlink: symlinkSync, chmod: chmodSync,
};
