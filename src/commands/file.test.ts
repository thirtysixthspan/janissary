import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FILE_READ_USAGE } from '../file-read/command.js';
import { command } from './file.js';

type FakeTab = { label: string; workspaceDir?: string; remote?: unknown };

describe('file command match', () => {
  it('accepts file and any letter case, and rejects files', () => {
    expect(command.match('file')).toBe(true);
    expect(command.match('FILE read x')).toBe(true);
    expect(command.match('files x')).toBe(false);
  });
});

describe('file command run', () => {
  let root: string;
  let workspace: string;
  let appended: { input: string; output: string }[];
  let lookups: string[];
  let remoteCalls: string[];
  let tabs: FakeTab[];

  const managers = () => ({
    tab: {
      launchDir: root,
      byLabel: (label: string) => {
        lookups.push(label);
        return tabs.find((tab) => tab.label === label);
      },
      append: (_label: string, entry: { input: string; output: string }) => { appended.push(entry); },
    },
    remote: {
      get: (label: string) => { remoteCalls.push(`get:${label}`); },
      readyOf: (label: string) => { remoteCalls.push(`readyOf:${label}`); },
      workspaceOf: (label: string) => { remoteCalls.push(`workspaceOf:${label}`); },
    },
  });

  const run = async (line: string, label = 'janus') => {
    await command.run(line, { label, index: 0 }, managers() as never);
    expect(appended).toHaveLength(1);
    expect(appended[0].input).toBe(line);
    return appended[0].output;
  };

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'file-command-root-'));
    workspace = mkdtempSync(path.join(tmpdir(), 'file-command-workspace-'));
    appended = [];
    lookups = [];
    remoteCalls = [];
    tabs = [];
    writeFileSync(path.join(root, 'notes.md'), 'project one\nproject two\n');
    writeFileSync(path.join(workspace, 'notes.md'), 'workspace one\n');
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    rmSync(workspace, { recursive: true, force: true });
  });

  it('reads under the workspace of a local tab that has one', async () => {
    tabs = [{ label: 'janus', workspaceDir: workspace }];
    expect(await run('file read notes.md')).toBe('1\tworkspace one');
  });

  it('reads under the project directory for a local tab without a workspace', async () => {
    tabs = [{ label: 'janus' }];
    expect(await run('file read notes.md')).toBe('1\tproject one\n2\tproject two');
  });

  it('reads under the project directory for a label with no tab', async () => {
    mkdirSync(path.join(root, 'src'));
    writeFileSync(path.join(root, 'src', 'a.ts'), 'a\nb\nc\n');
    expect(await run('file read src/a.ts --offset 2 --limit 1', 'missing')).toBe('2\tb\n(showing lines 2-2 of 3; continue with --offset 3)');
  });

  it('prints the usage line without looking up the tab', async () => {
    expect(await run('file read')).toBe(FILE_READ_USAGE);
    expect(lookups).toEqual([]);
  });

  it('prints the unavailable line on a remote tab without reading the local disk', async () => {
    tabs = [{ label: 'janus', remote: { host: 'box' } }];
    const output = await run('file read notes.md');
    expect(output).toBe('Remote connection unavailable.');
    expect(output).not.toContain('project one');
    expect(remoteCalls).toEqual([]);
  });
});
