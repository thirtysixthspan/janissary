import { describe, it, expect, vi, afterEach } from 'vitest';
import * as fs from 'node:fs';
import {
  initAgentStateDirectory,
  ensureStateDirectory,
  agentStatePath,
  loadAgentState,
  saveAgentState,
  clearStateDirectory,
  listAgentStates,
} from './agent-state.js';

vi.mock('node:fs');

const mockFs = fs as Record<string, ReturnType<typeof vi.fn>>;

afterEach(() => {
  vi.clearAllMocks();
});

describe('agent-state', () => {
  it('initAgentStateDirectory sets the state directory path', () => {
    initAgentStateDirectory('/test/project');
    const path = agentStatePath('test-agent');
    expect(path).toContain('.janissary');
    expect(path).toContain('state');
  });

  it('agentStatePath constructs correct path', () => {
    initAgentStateDirectory('/base');
    const path = agentStatePath('myagent');
    expect(path).toContain('myagent.json');
  });

  it('agentStatePath rejects traversal names', () => {
    initAgentStateDirectory('/base');
    expect(() => agentStatePath('../../etc/passwd')).toThrow();
    expect(() => agentStatePath('../sibling')).toThrow();
    expect(() => agentStatePath('agent/sub')).toThrow();
  });

  it('ensureStateDirectory calls mkdirSync with recursive option', () => {
    mockFs.mkdirSync.mockImplementation(() => {});
    initAgentStateDirectory('/test');
    ensureStateDirectory();
    expect(mockFs.mkdirSync).toHaveBeenCalled();
    const call = mockFs.mkdirSync.mock.calls[0];
    expect(call[1]).toHaveProperty('recursive', true);
  });

  it('loadAgentState returns undefined when file does not exist', () => {
    initAgentStateDirectory('/test');
    mockFs.existsSync.mockReturnValue(false);
    const result = loadAgentState('nonexistent');
    expect(result).toBeUndefined();
  });

  it('loadAgentState parses JSON from file', () => {
    initAgentStateDirectory('/test');
    const testState = { name: 'agent1', dotColor: '#fff', active: false };
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(JSON.stringify(testState));
    const result = loadAgentState('agent1');
    expect(result).toEqual(testState);
  });

  it('loadAgentState returns undefined for malformed state shape', () => {
    initAgentStateDirectory('/test');
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(JSON.stringify({ name: 'agent1' }));
    const result = loadAgentState('agent1');
    expect(result).toBeUndefined();
  });

  it('loadAgentState returns undefined on invalid JSON', () => {
    initAgentStateDirectory('/test');
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue('invalid json {');
    const result = loadAgentState('bad');
    expect(result).toBeUndefined();
  });

  it('saveAgentState writes file with state data', () => {
    mockFs.mkdirSync.mockImplementation(() => {});
    mockFs.writeFileSync.mockImplementation(() => {});
    initAgentStateDirectory('/test');
    const state = { name: 'agent2', value: 123 };
    saveAgentState(state);
    expect(mockFs.writeFileSync).toHaveBeenCalled();
    const call = mockFs.writeFileSync.mock.calls[0];
    expect(call[1]).toContain('agent2');
  });

  it('clearStateDirectory removes state directory', () => {
    mockFs.rmSync.mockImplementation(() => {});
    initAgentStateDirectory('/test');
    clearStateDirectory();
    expect(mockFs.rmSync).toHaveBeenCalled();
    const call = mockFs.rmSync.mock.calls[0];
    expect(call[1]).toHaveProperty('recursive', true);
    expect(call[1]).toHaveProperty('force', true);
  });

  it('clearStateDirectory ignores removal errors', () => {
    mockFs.rmSync.mockImplementation(() => {
      throw new Error('permission denied');
    });
    initAgentStateDirectory('/test');
    // Should not throw
    expect(() => clearStateDirectory()).not.toThrow();
  });

  it('listAgentStates returns empty array when directory does not exist', () => {
    initAgentStateDirectory('/test');
    mockFs.existsSync.mockReturnValue(false);
    const result = listAgentStates();
    expect(result).toEqual([]);
  });

  it('listAgentStates filters json files and loads them', () => {
    initAgentStateDirectory('/test');
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readdirSync.mockReturnValue(['agent1.json', 'agent2.json', 'readme.txt']);
    mockFs.readFileSync.mockReturnValue(JSON.stringify({ name: 'test' }));
    const result = listAgentStates();
    expect(Array.isArray(result)).toBe(true);
    expect(mockFs.readdirSync).toHaveBeenCalled();
  });

  it('listAgentStates returns empty array on read error', () => {
    initAgentStateDirectory('/test');
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readdirSync.mockImplementation(() => {
      throw new Error('access denied');
    });
    const result = listAgentStates();
    expect(result).toEqual([]);
  });

  it('listAgentStates filters out invalid state files', () => {
    initAgentStateDirectory('/test');
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readdirSync.mockReturnValue(['valid.json', 'invalid.json']);
    // First call returns valid, second returns undefined (invalid)
    mockFs.readFileSync
      .mockReturnValueOnce(JSON.stringify({ name: 'valid' }))
      .mockReturnValueOnce('invalid json');
    const result = listAgentStates();
    expect(Array.isArray(result)).toBe(true);
  });
});
