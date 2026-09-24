import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { initWorkspaceDir, workspacePath } from '../workspace/index.js';
import { notify } from '../notifications/index.js';
import type { Managers } from '../managers.js';
import type { Tab } from '../tab/types.js';
import { resolveLocalLaunchName } from './local.js';
import { localRunningRefusal } from './messages.js';

vi.mock('../notifications/index.js', () => ({ notify: vi.fn() }));

let root: string;

function managersWith(tabs: Partial<Tab>[]): Managers {
  return {
    tab: { tabs, allLabels: () => tabs.map((tab) => tab.label) },
    sessions: { view: () => [] },
  } as unknown as Managers;
}

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'launch-name-local-'));
  initWorkspaceDir(root, path.join(root, '.claude.json'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  vi.clearAllMocks();
});

describe('resolveLocalLaunchName', () => {
  it('refuses a -w name whose workspace an open tab uses under another case, removing nothing', () => {
    mkdirSync(workspacePath('foo'), { recursive: true });
    writeFileSync(path.join(workspacePath('foo'), 'live.txt'), 'live work');
    const managers = managersWith([{ label: 'bekir', workspaceDir: workspacePath('foo') }]);

    const resolved = resolveLocalLaunchName(managers, { creator: 'janus', name: 'Foo', explicit: true, workspace: true });

    expect(resolved).toBeUndefined();
    expect(notify).toHaveBeenCalledWith(managers, 'launch-refused', 'janus', localRunningRefusal('Foo', workspacePath('Foo')));
    expect(existsSync(path.join(workspacePath('foo'), 'live.txt'))).toBe(true);
  });

  it('lets a -w name go ahead when no tab uses its workspace in any case', () => {
    const managers = managersWith([{ label: 'bekir', workspaceDir: workspacePath('bar') }]);

    expect(resolveLocalLaunchName(managers, { creator: 'janus', name: 'Foo', explicit: true, workspace: true })).toBe('Foo');
    expect(notify).not.toHaveBeenCalled();
  });
});
