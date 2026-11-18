import { describe, expect, it } from 'vitest';
import {
  APPLICATION_COMMAND_KINDS,
  APPLICATION_COMMAND_NATIVE_TOOLS,
  APPLICATION_COMMAND_SOURCES,
} from '../../shared/application-commands.js';
import { listApplicationCommands } from '../../application-commands.js';
import { isCommandsData, toPayload } from './payload.js';
import { isCommandsPayload, KINDS, NATIVE_TOOLS, SOURCES } from './shared.js';

function sourceRow(kind: string, nativeTool?: string): Record<string, unknown> {
  return {
    name: 'x',
    kind,
    aliases: [],
    forms: ['x'],
    enabled: true,
    agentAccess: true,
    effectiveEnabled: true,
    effectiveAgentAccess: true,
    ...(nativeTool !== undefined && { nativeTool }),
  };
}

describe('command inventory domains', () => {
  it('builds the runtime guard sets from the shared declaration arrays', () => {
    expect([...KINDS]).toEqual([...APPLICATION_COMMAND_KINDS]);
    expect([...NATIVE_TOOLS]).toEqual([...APPLICATION_COMMAND_NATIVE_TOOLS]);
    expect([...SOURCES]).toEqual([...APPLICATION_COMMAND_SOURCES]);
  });

  it('accepts every declared kind, native tool, and source', () => {
    for (const source of APPLICATION_COMMAND_SOURCES) {
      for (const kind of APPLICATION_COMMAND_KINDS) {
        expect(isCommandsData({ commands: [sourceRow(kind)], source, path: '' })).toBe(true);
      }
      for (const tool of APPLICATION_COMMAND_NATIVE_TOOLS) {
        expect(isCommandsData({ commands: [sourceRow('native', tool)], source, path: '' })).toBe(true);
        const payloadRow = { name: 'x', label: 'x', enabled: true, agentAccess: true, effectiveEnabled: true, effectiveAgentAccess: true, nativeTool: tool };
        expect(isCommandsPayload({ commands: [payloadRow], source, path: '' })).toBe(true);
      }
    }
  });

  it('rejects values outside the declared domains', () => {
    expect(isCommandsData({ commands: [sourceRow('other')], source: 'home', path: '' })).toBe(false);
    expect(isCommandsData({ commands: [sourceRow('native', 'other')], source: 'home', path: '' })).toBe(false);
    expect(isCommandsData({ commands: [], source: 'other', path: '' })).toBe(false);
  });

  it('accepts the real parentless subagent row through the Commands guards after toPayload', () => {
    const native = listApplicationCommands().find((row) => row.name === 'subagent');
    expect(native).toBeDefined();
    const data = {
      commands: [{
        ...native, enabled: true, agentAccess: true, effectiveEnabled: true, effectiveAgentAccess: true,
      }],
      source: 'home', path: '',
    };
    expect(isCommandsData(data)).toBe(true);
    const payload = toPayload(data);
    expect(payload.commands).toHaveLength(1);
    expect(payload.commands[0]).toMatchObject({ name: 'subagent', label: 'subagent', nativeTool: 'subagent' });
    expect(payload.commands[0]).not.toHaveProperty('parent');
    expect(isCommandsPayload(payload)).toBe(true);
    expect(isCommandsPayload({ ...payload, commands: [{ ...payload.commands[0], parent: '' }] })).toBe(false);
  });
});
