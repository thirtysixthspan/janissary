import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Managers } from '../managers.js';
import type { TabPluginServerCapabilities } from './api.js';
import { globalCommands, initGlobalHistory } from '../global-history.js';
import { lineCapabilities } from './line-capabilities.js';
import { activate } from './shell/activate.js';
import type { ShellPayload } from './shell/shared.js';

const PAYLOAD: ShellPayload = {
  instanceKey: 'shell-1', ptyId: 'pty7', cwd: '/repo', root: '/repo', workspace: false, cols: 80, rows: 24,
  connections: [], schedule: [], hookNonce: 'c'.repeat(32),
};

let home: string;
beforeEach(() => {
  home = mkdtempSync(path.join(tmpdir(), 'janus-shell-history-'));
  initGlobalHistory(home);
});
afterEach(() => { rmSync(home, { recursive: true, force: true }); });

function capabilitiesFor(answeringLabel: string) {
  const tabs = [
    { label: 'kemal', plugin: { id: 'shell' } },
    { label: 'bilal' },
  ];
  const managers = {
    tab: { byLabel: (label: string) => tabs.find((tab) => tab.label === label), tabs },
  } as unknown as Managers;
  return lineCapabilities({
    managers,
    declaration: { id: 'shell' } as never,
    origin: { label: answeringLabel, command: 'zsh' },
    answeringLabel,
    isEnabled: () => true,
  });
}

describe('recordGlobalHistory', () => {
  it('adds a line from the plugin\'s own tab to the global history', () => {
    capabilitiesFor('kemal').recordGlobalHistory('  git status  ');

    expect(globalCommands()).toEqual(['git status']);
  });

  it('records nothing for a tab that is not the plugin\'s own, or a blank line', () => {
    capabilitiesFor('bilal').recordGlobalHistory('git status');
    capabilitiesFor('kemal').recordGlobalHistory(' '.repeat(3));

    expect(globalCommands()).toEqual([]);
  });
});

describe('the shell\'s remember intent', () => {
  it('hands the line it was given to recordGlobalHistory', async () => {
    const recordGlobalHistory = vi.fn();
    const capabilities = { recordGlobalHistory } as unknown as TabPluginServerCapabilities;

    await activate().intent({ tab: 'kemal', intent: 'remember', payload: 'ls -la', tabPayload: PAYLOAD }, capabilities);

    expect(recordGlobalHistory).toHaveBeenCalledWith('ls -la');
  });
});
