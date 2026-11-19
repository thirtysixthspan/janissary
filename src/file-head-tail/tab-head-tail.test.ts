import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readWorkspaceLines } from '../file-read/read.js';
import { headTailInTab } from './tab-head-tail.js';

let root: string;

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'janus-file-head-tail-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const managersWith = (workspaceDir?: string) => ({
  tab: {
    launchDir: root,
    byLabel: () => ({ label: 'janus', ...(workspaceDir !== undefined && { workspaceDir }) }),
  },
}) as never;

function makeFile(relative: string, content: string): void {
  const target = path.join(root, relative);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content);
}

describe('headTailInTab', () => {
  it('prints the first N numbered lines from line 1', () => {
    makeFile('a.md', 'a\nb\nc\nd\ne');
    expect(headTailInTab(managersWith(), 'janus', 'file head a.md -n 2')).toBe([
      '1\ta',
      '2\tb',
      '(showing lines 1-2 of 5; continue with --offset 3)',
    ].join('\n'));
  });

  it('prints the last N numbered lines with their absolute positions', () => {
    makeFile('a.md', 'a\nb\nc\nd\ne');
    expect(headTailInTab(managersWith(), 'janus', 'file tail a.md -n 2')).toBe('4\td\n5\te');
  });

  it('counts lines the same way as file read when the text ends with a newline', () => {
    makeFile('a.md', 'a\nb\nc\nd\ne\n');
    expect(headTailInTab(managersWith(), 'janus', 'file tail a.md -n 2')).toBe('4\td\n5\te');
  });

  it('prints (empty file) in either direction for an empty file', () => {
    makeFile('a.md', '');
    expect(headTailInTab(managersWith(), 'janus', 'file head a.md')).toBe('(empty file)');
    expect(headTailInTab(managersWith(), 'janus', 'file tail a.md')).toBe('(empty file)');
  });

  it('prints every line when the count exceeds the file length', () => {
    makeFile('a.md', 'a\nb');
    expect(headTailInTab(managersWith(), 'janus', 'file head a.md -n 10')).toBe('1\ta\n2\tb');
    expect(headTailInTab(managersWith(), 'janus', 'file tail a.md -n 10')).toBe('1\ta\n2\tb');
  });

  it('prints notdir when the target is a directory', () => {
    mkdirSync(path.join(root, 'sub'));
    expect(headTailInTab(managersWith(), 'janus', 'file head sub')).toBe('notdir');
    expect(headTailInTab(managersWith(), 'janus', 'file tail sub')).toBe('notdir');
  });

  it('prints notdir when the target is a symlink to a directory', () => {
    mkdirSync(path.join(root, 'sub'));
    symlinkSync(path.join(root, 'sub'), path.join(root, 'dirlink'));
    expect(headTailInTab(managersWith(), 'janus', 'file head dirlink')).toBe('notdir');
    expect(headTailInTab(managersWith(), 'janus', 'file tail dirlink')).toBe('notdir');
  });

  it('reads a symlink to a regular file', () => {
    makeFile('a.md', 'a\nb\nc');
    symlinkSync(path.join(root, 'a.md'), path.join(root, 'filelink'));
    expect(headTailInTab(managersWith(), 'janus', 'file head filelink -n 2')).toBe([
      '1\ta',
      '2\tb',
      '(showing lines 1-2 of 3; continue with --offset 3)',
    ].join('\n'));
    expect(headTailInTab(managersWith(), 'janus', 'file tail filelink -n 2')).toBe('2\tb\n3\tc');
  });

  it('keeps file read verbose lines for absent and out-of-workspace paths', () => {
    expect(headTailInTab(managersWith(), 'janus', 'file head missing.md')).toBe('File not found: missing.md.');
    expect(headTailInTab(managersWith(), 'janus', 'file tail missing.md')).toBe('File not found: missing.md.');
    expect(headTailInTab(managersWith(), 'janus', 'file head ..')).toBe('Outside the workspace: ...');
    expect(headTailInTab(managersWith(), 'janus', 'file tail ..')).toBe('Outside the workspace: ...');
  });

  it('keeps file read verbose lines for a non-text file', () => {
    writeFileSync(path.join(root, 'a.bin'), Buffer.from([0x61, 0x00, 0x62]));
    expect(headTailInTab(managersWith(), 'janus', 'file head a.bin')).toBe('Not a text file: a.bin.');
    expect(headTailInTab(managersWith(), 'janus', 'file tail a.bin')).toBe('Not a text file: a.bin.');
  });

  it('numbers head and tail the same way as file read', () => {
    makeFile('a.md', 'a\nb\nc\nd\ne');
    expect(headTailInTab(managersWith(), 'janus', 'file head a.md -n 3')).toBe(
      readWorkspaceLines(root, { path: 'a.md', offset: 1, limit: 3 }),
    );
    expect(headTailInTab(managersWith(), 'janus', 'file tail a.md -n 3')).toBe(
      readWorkspaceLines(root, { path: 'a.md', offset: 3, limit: 3 }),
    );
  });

  it('resolves against the tab workspace or the launch directory', () => {
    const workspace = mkdtempSync(path.join(tmpdir(), 'janus-file-head-tail-ws-'));
    try {
      writeFileSync(path.join(workspace, 'ws.md'), 'w\n');
      const withWorkspace = ({
        tab: { launchDir: root, byLabel: () => ({ label: 'janus', workspaceDir: workspace }) },
      }) as never;
      expect(headTailInTab(withWorkspace, 'janus', 'file head ws.md -n 1')).toContain('1\tw');
      expect(headTailInTab(managersWith(), 'janus', 'file head ws.md -n 1')).toBe('File not found: ws.md.');
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it('returns the usage line for malformed arguments', () => {
    expect(headTailInTab(managersWith(), 'janus', 'file head')).toBe('Usage: file head <path> [-n <lines>]');
    expect(headTailInTab(managersWith(), 'janus', 'file tail a.md -n 0')).toBe('Usage: file tail <path> [-n <lines>]');
  });
});
