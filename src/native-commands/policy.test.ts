import { describe, expect, it } from 'vitest';
import { effectiveCommandSetting } from './policy.js';
import type { CommandSettingsSnapshot } from './settings-types.js';

const snapshot = {
  commands: [{
    name: 'browser goto', kind: 'native', aliases: [], forms: ['browser goto'],
    enabled: true, agentAccess: false, effectiveEnabled: true, effectiveAgentAccess: false,
  }],
  source: 'default',
  path: '',
} as const satisfies CommandSettingsSnapshot;

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
