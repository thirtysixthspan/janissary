import { describe, it, expect } from 'vitest';
import { command } from './agent.js';
import { resolveAgentName, parseAgentCommand, agentNames } from '../commands.js';

describe('agent command', () => {
  it('has the correct name', () => {
    expect(command.name).toBe('agent');
  });

  it('matches agent commands with a name', () => {
    expect(command.match('agent bilal')).toBe(true);
    expect(command.match('AGENT bilal')).toBe(true);
    expect(command.match('agent')).toBe(true);
    expect(command.match('agent --workspace')).toBe(true);
  });

  it('does not match non-agent input', () => {
    expect(command.match('clear')).toBe(false);
    expect(command.match('msg bilal')).toBe(false);
    expect(command.match('agency')).toBe(false);
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
