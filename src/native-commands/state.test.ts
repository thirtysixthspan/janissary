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

type Settings = Record<string, { enabled?: boolean; agentAccess?: boolean }>;

function fixture(values: Settings): { manager: NativeCommandSettingsManager; file: string } {
  const base = mkdtempSync(path.join(os.tmpdir(), 'native-command-state-'));
  roots.push(base);
  const root = path.join(base, 'project');
  const home = path.join(base, 'home');
  mkdirSync(root);
  mkdirSync(path.join(home, '.janissary'), { recursive: true });
  const file = path.join(home, '.janissary', 'commands.json');
  writeFileSync(file, JSON.stringify(values));
  return { manager: new NativeCommandSettingsManager(root, home), file };
}

function managerWith(values: Settings): NativeCommandSettingsManager {
  return fixture(values).manager;
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

describe('NativeCommandSettingsManager hand edits', () => {
  it('ignores a hand edit until refresh, then reflects it', () => {
    const { manager, file } = fixture({});

    writeFileSync(file, JSON.stringify({ theme: { enabled: false } }));

    expect(projectDisabledApplicationCommands(manager.current())).toEqual([]);
    expect(manager.current().commands.find(({ name }) => name === 'theme'))
      .toMatchObject({ effectiveEnabled: true });

    manager.refresh();

    expect(projectDisabledApplicationCommands(manager.current())).toEqual([
      { name: 'theme', aliases: [], forms: ['theme'] },
      { name: 'theme sync', aliases: [], forms: ['theme sync'] },
    ]);
  });
});
