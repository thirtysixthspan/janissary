import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NativeCommandSettingsManager } from './manager.js';
import { disabledApplicationCommand, effectiveCommandSetting } from './policy.js';
import type { CommandSettingsSnapshot } from './settings-types.js';

const snapshot = {
  commands: [{
    name: 'browser goto', kind: 'native', aliases: [], forms: ['browser goto'],
    enabled: true, agentAccess: false, effectiveEnabled: true, effectiveAgentAccess: false,
  }],
  source: 'default',
  path: '',
} as const satisfies CommandSettingsSnapshot;

const disabledAsk = {
  ...snapshot,
  commands: [{
    name: 'ask', kind: 'builtin', aliases: [], forms: ['ask'],
    enabled: false, agentAccess: true, effectiveEnabled: false, effectiveAgentAccess: true,
  }],
} as const satisfies CommandSettingsSnapshot;

const disabledFileRead = {
  ...snapshot,
  commands: [{
    name: 'file', kind: 'builtin', aliases: [], forms: ['file'],
    enabled: true, agentAccess: true, effectiveEnabled: true, effectiveAgentAccess: true,
  }, {
    name: 'file read', kind: 'native', aliases: [], forms: ['file read'], parent: 'file',
    enabled: false, agentAccess: true, effectiveEnabled: false, effectiveAgentAccess: true,
  }],
} as const satisfies CommandSettingsSnapshot;

const disabledFileGlob = {
  ...snapshot,
  commands: [{
    name: 'file', kind: 'builtin', aliases: [], forms: ['file'],
    enabled: true, agentAccess: true, effectiveEnabled: true, effectiveAgentAccess: true,
  }, {
    name: 'file glob', kind: 'native', aliases: [], forms: ['file glob'], parent: 'file',
    enabled: false, agentAccess: true, effectiveEnabled: false, effectiveAgentAccess: true,
  }],
} as const satisfies CommandSettingsSnapshot;

describe('disabledApplicationCommand', () => {
  it('resolves a space-separated line without a fallback', () => {
    expect(disabledApplicationCommand('ask hello', disabledAsk)?.name).toBe('ask');
  });

  it('refuses a punctuation-joined line through the fallback name', () => {
    expect(disabledApplicationCommand('ask:hello', disabledAsk)).toBeUndefined();
    expect(disabledApplicationCommand('ask:hello', disabledAsk, 'ask')?.name).toBe('ask');
  });

  it('refuses a disabled file read row without disabling bare file', () => {
    expect(disabledApplicationCommand('file read a.md', disabledFileRead)?.name).toBe('file read');
    expect(disabledApplicationCommand('file', disabledFileRead)).toBeUndefined();
  });

  it('refuses a disabled file glob row without disabling bare file', () => {
    expect(disabledApplicationCommand('file glob *.ts', disabledFileGlob)?.name).toBe('file glob');
    expect(disabledApplicationCommand('file', disabledFileGlob)).toBeUndefined();
  });

  it('does not refuse when the fallback row is enabled', () => {
    expect(disabledApplicationCommand('ask:hello', snapshot, 'ask')).toBeUndefined();
  });
});

describe('effectiveCommandSetting', () => {
  it('reports both values enabled without a snapshot', () => {
    expect(effectiveCommandSetting(undefined, 'browser goto'))
      .toEqual({ effectiveEnabled: true, effectiveAgentAccess: true });
  });

  it('reports both values enabled for a row the snapshot does not list', () => {
    expect(effectiveCommandSetting(snapshot, 'clear'))
      .toEqual({ effectiveEnabled: true, effectiveAgentAccess: true });
  });

  it('reports the effective values of a listed row', () => {
    expect(effectiveCommandSetting(snapshot, 'browser goto'))
      .toEqual({ effectiveEnabled: true, effectiveAgentAccess: false });
  });
});

describe('file mutation rows', () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots) rmSync(root, { recursive: true, force: true });
    roots.length = 0;
  });

  function current(values: Record<string, { enabled?: boolean }>): CommandSettingsSnapshot {
    const base = mkdtempSync(path.join(os.tmpdir(), 'native-command-policy-'));
    roots.push(base);
    mkdirSync(path.join(base, 'project'));
    mkdirSync(path.join(base, 'home', '.janissary'), { recursive: true });
    writeFileSync(path.join(base, 'home', '.janissary', 'commands.json'), JSON.stringify(values));
    return new NativeCommandSettingsManager(path.join(base, 'project'), path.join(base, 'home')).current();
  }

  it('disables only file write when file write is disabled', () => {
    const settings = current({ 'file write': { enabled: false } });
    expect(effectiveCommandSetting(settings, 'file write').effectiveEnabled).toBe(false);
    expect(effectiveCommandSetting(settings, 'file edit').effectiveEnabled).toBe(true);
    expect(effectiveCommandSetting(settings, 'file read').effectiveEnabled).toBe(true);
  });

  it('disables both mutation rows when file is disabled', () => {
    const settings = current({ file: { enabled: false } });
    expect(effectiveCommandSetting(settings, 'file write').effectiveEnabled).toBe(false);
    expect(effectiveCommandSetting(settings, 'file edit').effectiveEnabled).toBe(false);
  });

  it('refuses the typed file write through ordinary dispatch when its row is disabled', () => {
    const settings = current({ 'file write': { enabled: false } });
    expect(disabledApplicationCommand('file write {"path":"a.md","content":"x"}', settings)?.name).toBe('file write');
    expect(disabledApplicationCommand('file edit {"path":"a.md"}', settings)).toBeUndefined();
  });
});
