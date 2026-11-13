import { describe, expect, it } from 'vitest';
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
