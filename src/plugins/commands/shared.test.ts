import { describe, expect, it } from 'vitest';
import { isCommandsPayload, isSetIntent } from './shared.js';

const NATIVE_ROW = {
  name: 'db sqlite query',
  label: 'db sqlite query',
  enabled: true,
  agentAccess: true,
  effectiveEnabled: true,
  effectiveAgentAccess: true,
  parent: 'db',
  nativeTool: 'database',
};

const PAYLOAD = {
  commands: [NATIVE_ROW],
  source: 'home',
  path: '/home/me/.janissary/commands.json',
};

describe('isCommandsPayload', () => {
  it('accepts a complete payload and an empty row list', () => {
    expect(isCommandsPayload(PAYLOAD)).toBe(true);
    expect(isCommandsPayload({ ...PAYLOAD, commands: [] })).toBe(true);
    expect(isCommandsPayload({ ...PAYLOAD, source: 'project', problem: 'commands.json is damaged.' })).toBe(true);
  });

  it('accepts a row without a parent or native tool', () => {
    const row = {
      name: 'quit',
      label: 'quit',
      enabled: true,
      agentAccess: true,
      effectiveEnabled: true,
      effectiveAgentAccess: true,
    };
    expect(isCommandsPayload({ ...PAYLOAD, commands: [row] })).toBe(true);
  });

  it.each([
    ['null', null],
    ['an array', []],
    ['a string', 'commands'],
    ['missing commands', { ...PAYLOAD, commands: undefined }],
    ['a non-array commands field', { ...PAYLOAD, commands: {} }],
    ['a missing name', { ...PAYLOAD, commands: [{ ...NATIVE_ROW, name: undefined }] }],
    ['a mistyped name', { ...PAYLOAD, commands: [{ ...NATIVE_ROW, name: 7 }] }],
    ['an empty label', { ...PAYLOAD, commands: [{ ...NATIVE_ROW, label: ' ' }] }],
    ['a missing enabled flag', { ...PAYLOAD, commands: [{ ...NATIVE_ROW, enabled: undefined }] }],
    ['a mistyped agentAccess flag', { ...PAYLOAD, commands: [{ ...NATIVE_ROW, agentAccess: 'yes' }] }],
    ['a mistyped effectiveEnabled flag', { ...PAYLOAD, commands: [{ ...NATIVE_ROW, effectiveEnabled: 1 }] }],
    ['a missing effectiveAgentAccess flag', { ...PAYLOAD, commands: [{ ...NATIVE_ROW, effectiveAgentAccess: undefined }] }],
    ['an unknown source', { ...PAYLOAD, source: 'workspace' }],
    ['a mistyped path', { ...PAYLOAD, path: 4 }],
    ['a mistyped problem', { ...PAYLOAD, problem: 4 }],
    ['an invalid parent', { ...PAYLOAD, commands: [{ ...NATIVE_ROW, parent: 4 }] }],
    ['an empty parent', { ...PAYLOAD, commands: [{ ...NATIVE_ROW, parent: '' }] }],
    ['an invalid native tool', { ...PAYLOAD, commands: [{ ...NATIVE_ROW, nativeTool: 'terminal' }] }],
  ])('rejects %s', (_label, value) => {
    expect(isCommandsPayload(value)).toBe(false);
  });
});

describe('isSetIntent', () => {
  it('accepts both settings with a boolean value and a nonempty name', () => {
    expect(isSetIntent({ name: 'quit', setting: 'enabled', value: false })).toBe(true);
    expect(isSetIntent({ name: 'browser goto', setting: 'agentAccess', value: true })).toBe(true);
  });

  it.each([
    ['another setting', { name: 'quit', setting: 'scope', value: true }],
    ['an empty name', { name: '  ', setting: 'enabled', value: true }],
    ['a non-string name', { name: 1, setting: 'enabled', value: true }],
    ['a nonboolean value', { name: 'quit', setting: 'enabled', value: 'yes' }],
    ['a missing value', { name: 'quit', setting: 'enabled' }],
    ['null', null],
    ['an array', []],
  ])('rejects %s', (_label, value) => {
    expect(isSetIntent(value)).toBe(false);
  });
});
