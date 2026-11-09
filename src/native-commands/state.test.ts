import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NativeCommandSettingsManager } from './manager.js';
import { projectDisabledApplicationCommands } from './state.js';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

function managerWith(values: Record<string, { enabled?: boolean; agentAccess?: boolean }>): NativeCommandSettingsManager {
  const base = mkdtempSync(path.join(os.tmpdir(), 'native-command-state-'));
  roots.push(base);
  const root = path.join(base, 'project');
  const home = path.join(base, 'home');
  mkdirSync(root);
  mkdirSync(path.join(home, '.janissary'), { recursive: true });
  writeFileSync(path.join(home, '.janissary', 'commands.json'), JSON.stringify(values));
  return new NativeCommandSettingsManager(root, home);
}

describe('projectDisabledApplicationCommands', () => {
  it('keeps only effectively disabled rows and only their wire fields', () => {
    const manager = managerWith({ close: { enabled: false } });

    expect(projectDisabledApplicationCommands(manager.current())).toEqual([
      { name: 'close', aliases: ['exit'], forms: ['close'] },
    ]);
  });

  it('includes children disabled by a disabled parent', () => {
    const manager = managerWith({ browser: { enabled: false } });

    expect(projectDisabledApplicationCommands(manager.current()).map(({ name }) => name))
      .toEqual(expect.arrayContaining(['browser', 'browser content', 'browser eval', 'browser goto']));
  });

  it('excludes a native row restricted only for agents', () => {
    const manager = managerWith({ 'browser content': { agentAccess: false } });

    expect(projectDisabledApplicationCommands(manager.current()).map(({ name }) => name))
      .not.toContain('browser content');
    expect(manager.current().commands.find(({ name }) => name === 'browser content'))
      .toMatchObject({ effectiveEnabled: true, effectiveAgentAccess: false });
  });

  it('returns an empty list for a missing or empty snapshot', () => {
    expect(projectDisabledApplicationCommands(undefined)).toEqual([]);
    expect(projectDisabledApplicationCommands({ commands: [], source: 'default', path: '' })).toEqual([]);
  });
});
