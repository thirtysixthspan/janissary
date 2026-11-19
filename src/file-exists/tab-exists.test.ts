import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FILE_EXISTS_USAGE } from './command.js';
import { fileExistsInTab } from './tab-exists.js';

let root: string;
let outside: string;

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'janus-file-exists-'));
  outside = mkdtempSync(path.join(tmpdir(), 'janus-file-exists-out-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  rmSync(outside, { recursive: true, force: true });
});

function makeFileIn(directory: string, relative: string): void {
  const target = path.join(directory, relative);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, 'x');
}

function makeFile(relative: string): void {
  makeFileIn(root, relative);
}

function makeDir(relative: string): void {
  mkdirSync(path.join(root, relative), { recursive: true });
}

const managersWith = (workspaceDir?: string) => ({
  tab: {
    launchDir: root,
    byLabel: () => ({ label: 'janus', ...(workspaceDir !== undefined && { workspaceDir }) }),
  },
}) as never;

describe('fileExistsInTab', () => {
  it('answers file for a regular file', () => {
    makeFile('a.md');
    expect(fileExistsInTab(managersWith(), 'janus', 'file exists a.md')).toBe('file');
  });

  it('answers dir for a directory', () => {
    makeDir('sub');
    expect(fileExistsInTab(managersWith(), 'janus', 'file exists sub')).toBe('dir');
  });

  it('answers link for a symlink rather than its target', () => {
    makeFile('a.md');
    symlinkSync(path.join(root, 'a.md'), path.join(root, 'alias'));
    expect(fileExistsInTab(managersWith(), 'janus', 'file exists alias')).toBe('link');
  });

  it('answers missing for an absent path', () => {
    expect(fileExistsInTab(managersWith(), 'janus', 'file exists absent')).toBe('missing');
  });

  it('answers forbidden for out-of-workspace and secret paths', () => {
    expect(fileExistsInTab(managersWith(), 'janus', 'file exists ..')).toBe('forbidden');
    expect(fileExistsInTab(managersWith(), 'janus', `file exists ${outside}`)).toBe('forbidden');
    makeFile('.env');
    expect(fileExistsInTab(managersWith(), 'janus', 'file exists .env')).toBe('forbidden');
  });

  it('answers forbidden for a symlink whose target escapes the workspace', () => {
    const target = path.join(outside, 'secret.txt');
    writeFileSync(target, 'x');
    symlinkSync(target, path.join(root, 'escape'));
    expect(fileExistsInTab(managersWith(), 'janus', 'file exists escape')).toBe('forbidden');
  });

  it('answers normally for .git and .janissary paths', () => {
    makeDir('.git');
    makeDir('.janissary');
    expect(fileExistsInTab(managersWith(), 'janus', 'file exists .git')).toBe('dir');
    expect(fileExistsInTab(managersWith(), 'janus', 'file exists .janissary')).toBe('dir');
  });

  it('resolves against the tab workspace or the launch directory', () => {
    const workspace = mkdtempSync(path.join(tmpdir(), 'janus-file-exists-ws-'));
    try {
      makeFileIn(workspace, 'ws.md');
      const withWorkspace = ({
        tab: { launchDir: root, byLabel: () => ({ label: 'janus', workspaceDir: workspace }) },
      }) as never;
      expect(fileExistsInTab(withWorkspace, 'janus', 'file exists ws.md')).toBe('file');
      expect(fileExistsInTab(managersWith(), 'janus', 'file exists ws.md')).toBe('missing');
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it('returns the usage line for malformed arguments', () => {
    expect(fileExistsInTab(managersWith(), 'janus', 'file exists')).toBe(FILE_EXISTS_USAGE);
    expect(fileExistsInTab(managersWith(), 'janus', 'file exists a b')).toBe(FILE_EXISTS_USAGE);
  });

  it('never echoes the requested path in its output', () => {
    makeFile('a.md');
    const results = ['file exists a.md', 'file exists absent', 'file exists ../a.md', 'file exists .env']
      .map((line) => fileExistsInTab(managersWith(), 'janus', line));
    expect(results).toEqual(['file', 'missing', 'forbidden', 'forbidden']);
    for (const result of results) expect(result).not.toContain('a.md');
  });
});
