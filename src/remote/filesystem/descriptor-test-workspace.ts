import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { LocalFileSystemPort } from '../../file-navigator/filesystem-port.js';
import type { OperationContext } from './operation-types.js';

export const STAMP = Date.parse('2026-11-19T13:50:00Z') / 1000;

export type TestWorkspace = {
  root: string;
  context: OperationContext;
  cleanup: () => void;
  makeFile: (relative: string, content?: string) => void;
  makeDir: (relative: string) => void;
  fixDir: (relative: string) => void;
  makeLink: (relative: string, target: string) => void;
  managers: () => never;
};

export function createWorkspace(): TestWorkspace {
  const root = mkdtempSync(path.join(tmpdir(), 'janus-typed-read-'));
  const makeFile = (relative: string, content = 'x'): void => {
    const target = path.join(root, relative);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content);
    chmodSync(target, 0o644);
    utimesSync(target, STAMP, STAMP);
  };
  const makeDir = (relative: string): void => {
    mkdirSync(path.join(root, relative), { recursive: true });
  };
  const fixDir = (relative: string): void => {
    const target = path.join(root, relative);
    chmodSync(target, 0o755);
    utimesSync(target, STAMP, STAMP);
  };
  const makeLink = (relative: string, target: string): void => {
    symlinkSync(target, path.join(root, relative));
  };
  return {
    root,
    context: {
      root,
      filesystem: new LocalFileSystemPort(),
      tokens: {},
      watch: () => ({}),
      unwatch: () => ({}),
      git: async () => ({ statuses: [] }),
      readFile: async () => ({ content: '' }),
      pasteSources: () => [],
    },
    cleanup: () => rmSync(root, { recursive: true, force: true }),
    makeFile, makeDir, fixDir, makeLink,
    managers: () => ({
      tab: { launchDir: root, byLabel: () => ({ label: 'janus' }) },
    }) as never,
  };
}
