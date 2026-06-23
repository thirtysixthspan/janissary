import { describe, it, expect } from 'vitest';
import { getOutput, resolveAgentName, parseAgentCommand, agentNames } from './commands.js';

describe('getOutput', () => {
  it('returns help with commands and key bindings', () => {
    const result = getOutput('help');
    expect(result).toContain('Commands');
    expect(result).toContain('Key Bindings');
    expect(result).toContain('connection');
    expect(result).toContain('Ctrl+C');
  });

  it('returns null for clear', () => {
    expect(getOutput('clear')).toBeNull();
  });

  it('returns null for quit', () => {
    expect(getOutput('quit')).toBeNull();
  });

  it('returns null for exit', () => {
    expect(getOutput('exit')).toBeNull();
  });

  it('returns null for close', () => {
    expect(getOutput('close')).toBeNull();
  });

  it('returns null for agent commands', () => {
    expect(getOutput('agent')).toBeNull();
    expect(getOutput('agent Bob')).toBeNull();
  });

  it('returns null for next', () => {
    expect(getOutput('next')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(getOutput('')).toBeNull();
  });

  it('returns null for whitespace-only input', () => {
    expect(getOutput('   ')).toBeNull();
  });

  it('is case insensitive', () => {
    expect(getOutput('HELP')).toContain('Commands');
  });

  it('returns error for unknown commands', () => {
    const result = getOutput('foobar');
    expect(result).toContain('Unknown command');
    expect(result).toContain('foobar');
    expect(result).toContain('"help"');
  });

  it('returns error for gibberish', () => {
    expect(getOutput('xyzzy')).toContain('Unknown command');
  });
});

describe('resolveAgentName', () => {
  it('returns the provided name lowercased for `agent <name>`', () => {
    expect(resolveAgentName('agent Bob', ['janus'])).toBe('bob');
  });

  it('returns a lowercased name from the pool for bare `agent`', () => {
    const name = resolveAgentName('agent', ['janus']);
    expect(name).not.toBeNull();
    expect(agentNames.map((n) => n.toLowerCase())).toContain(name);
  });

  it('does not return a name already in use for bare `agent`', () => {
    const existing = ['janus', ...agentNames.slice(0, 5)];
    const name = resolveAgentName('agent', existing);
    expect(name).not.toBeNull();
    if (name) {
      expect(existing.map((l) => l.toLowerCase())).not.toContain(name.toLowerCase());
    }
  });

  it('returns null when all names are in use', () => {
    const result = resolveAgentName('agent', agentNames);
    expect(result).toBeNull();
  });

  it('returns the lowercased name for `agent <name>` even if in pool', () => {
    const result = resolveAgentName('agent Ahmed', ['janus']);
    expect(result).toBe('ahmed');
  });
});

describe('parseAgentCommand', () => {
  it('extracts name from bare agent command', () => {
    const result = parseAgentCommand('agent');
    expect(result).toEqual({ name: '', workspace: false });
  });

  it('extracts name from agent <name>', () => {
    const result = parseAgentCommand('agent bilal');
    expect(result).toEqual({ name: 'bilal', workspace: false });
  });

  it('extracts name and workspace flag from agent <name> --workspace', () => {
    const result = parseAgentCommand('agent bilal --workspace');
    expect(result).toEqual({ name: 'bilal', workspace: true });
  });

  it('extracts name and workspace flag from agent <name> -w', () => {
    const result = parseAgentCommand('agent bilal -w');
    expect(result).toEqual({ name: 'bilal', workspace: true });
  });

  it('extracts workspace flag with bare agent', () => {
    const result = parseAgentCommand('agent --workspace');
    expect(result).toEqual({ name: '', workspace: true });
  });

  it('extracts workspace flag with bare agent -w', () => {
    const result = parseAgentCommand('agent -w');
    expect(result).toEqual({ name: '', workspace: true });
  });

  it('lowercases the name', () => {
    const result = parseAgentCommand('agent Ahmed -w');
    expect(result).toEqual({ name: 'ahmed', workspace: true });
  });
});
