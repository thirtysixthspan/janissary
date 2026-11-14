import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FILE_GLOB_USAGE } from './command.js';
import { globFilesInTab } from './tab-glob.js';

type FakeTab = { label: string; workspaceDir?: string; remote?: unknown };

describe('globFilesInTab', () => {
  let launch: string;
  let workspace: string;
  let lookups: string[];

  const managersWith = (tabs: FakeTab[]) => ({
    tab: {
      launchDir: launch,
      byLabel: (label: string) => {
        lookups.push(label);
        return tabs.find((tab) => tab.label === label);
      },
    },
  }) as never;

  beforeEach(() => {
    launch = mkdtempSync(path.join(tmpdir(), 'tab-glob-launch-'));
    workspace = mkdtempSync(path.join(tmpdir(), 'tab-glob-workspace-'));
    lookups = [];
    writeFileSync(path.join(launch, 'launch.md'), 'launch\n');
    writeFileSync(path.join(workspace, 'workspace.md'), 'workspace\n');
    mkdirSync(path.join(workspace, 'docs'));
    writeFileSync(path.join(workspace, 'docs', 'guide.md'), 'guide\n');
  });

  afterEach(() => {
    rmSync(launch, { recursive: true, force: true });
    rmSync(workspace, { recursive: true, force: true });
  });

  it('globs the workspace of a local tab that has one', async () => {
    const managers = managersWith([{ label: 'janus', workspaceDir: workspace }]);
    expect(await globFilesInTab(managers, 'janus', 'file glob *.md')).toBe('workspace.md');
    expect(await globFilesInTab(managers, 'janus', 'file glob **/*.md')).toBe('docs/guide.md\nworkspace.md');
  });

  it('globs the launch directory for a tab without a workspace', async () => {
    expect(await globFilesInTab(managersWith([{ label: 'janus' }]), 'janus', 'file glob *.md')).toBe('launch.md');
  });

  it('prints the unavailable line for a remote tab with no remote manager', async () => {
    const managers = managersWith([{ label: 'far', workspaceDir: workspace, remote: {} }]);
    expect(await globFilesInTab(managers, 'far', 'file glob *.md')).toBe('Remote connection unavailable.');
  });

  it('prints the usage line without looking up the tab', async () => {
    expect(await globFilesInTab(managersWith([{ label: 'janus' }]), 'janus', 'file glob')).toBe(FILE_GLOB_USAGE);
    expect(lookups).toEqual([]);
  });
});
