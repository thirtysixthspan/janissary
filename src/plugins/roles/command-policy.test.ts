import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { NativeCommandSettingsManager } from '../../native-commands/manager.js';
import { commandRestrictionsFrom } from './command-policy.js';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

function snapshotWith(settings: Record<string, unknown> = {}) {
  const base = mkdtempSync(path.join(tmpdir(), 'roles-command-policy-'));
  roots.push(base);
  const root = path.join(base, 'project');
  const home = path.join(base, 'home');
  mkdirSync(root);
  mkdirSync(home);
  const settingsPath = path.join(root, '.janissary', 'commands.json');
  if (Object.keys(settings).length > 0) {
    mkdirSync(path.dirname(settingsPath), { recursive: true });
    writeFileSync(settingsPath, JSON.stringify(settings));
  }
  return new NativeCommandSettingsManager(root, home).current();
}

describe('command restrictions from the commands snapshot', () => {
  it('maps a default snapshot to no restrictions', () => {
    expect(commandRestrictionsFrom(snapshotWith())).toEqual({});
  });

  it('maps a globally disabled command to application-wide', () => {
    expect(commandRestrictionsFrom(snapshotWith({ 'db sqlite query': { enabled: false } })))
      .toEqual({ 'db sqlite query': 'application-wide' });
  });

  it('maps an agent-access-only restriction to agents', () => {
    expect(commandRestrictionsFrom(snapshotWith({ 'browser goto': { agentAccess: false } })))
      .toEqual({ 'browser goto': 'agents' });
  });

  it('prefers application-wide when both controls are off', () => {
    expect(commandRestrictionsFrom(snapshotWith({
      'browser goto': { enabled: false, agentAccess: false },
    }))).toEqual({ 'browser goto': 'application-wide' });
  });

  it('follows a disabled parent into its children', () => {
    expect(commandRestrictionsFrom(snapshotWith({ db: { enabled: false } }))).toEqual({
      'db sqlite create': 'application-wide',
      'db sqlite delete': 'application-wide',
      'db sqlite query': 'application-wide',
      'db sqlite list': 'application-wide',
    });
  });

  it('maps a disabled file read row to application-wide', () => {
    expect(commandRestrictionsFrom(snapshotWith({ 'file read': { enabled: false } })))
      .toEqual({ 'file read': 'application-wide' });
  });

  it('follows a disabled file parent into every file command', () => {
    expect(commandRestrictionsFrom(snapshotWith({ file: { enabled: false } })))
      .toEqual({ 'file read': 'application-wide', 'file write': 'application-wide', 'file edit': 'application-wide' });
  });

  it('omits a disabled non-native command', () => {
    expect(commandRestrictionsFrom(snapshotWith({ clear: { enabled: false } }))).toEqual({});
  });

  it('maps the empty slice to no restrictions', () => {
    expect(commandRestrictionsFrom({ commands: [], source: 'default', path: '' })).toEqual({});
  });

  it('answers undefined for data it cannot read', () => {
    expect(commandRestrictionsFrom(null)).toBeUndefined();
    expect(commandRestrictionsFrom({ source: 'default', path: '' })).toBeUndefined();
    expect(commandRestrictionsFrom({ commands: 'none' })).toBeUndefined();
    expect(commandRestrictionsFrom({ commands: [null] })).toBeUndefined();
    expect(commandRestrictionsFrom({
      commands: [{ name: 7, effectiveEnabled: true, effectiveAgentAccess: true }],
    })).toBeUndefined();
    expect(commandRestrictionsFrom({
      commands: [{ name: 'browser goto', effectiveEnabled: 'no', effectiveAgentAccess: true }],
    })).toBeUndefined();
    expect(commandRestrictionsFrom({
      commands: [{ name: 'browser goto', effectiveEnabled: true, effectiveAgentAccess: 1 }],
    })).toBeUndefined();
  });
});
