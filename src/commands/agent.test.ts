import { describe, it, expect } from 'vitest';
import { command } from './agent.js';
import { resolveAgentName, parseAgentCommand } from '../agent/commands.js';
import { agentNames } from '../agent/names.js';

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

  it('truncates an explicit name to the configured max length', () => {
    const result = resolveAgentName('agent abcdefghijklmnopqrstuvwxyz', ['janus']);
    expect(result).toBe('abcdefghijklmnop'); // 16 chars, the default tabNameMaxLength
  });
});

describe('parseAgentCommand', () => {
  it('defaults a bare agent command to a workspace', () => {
    const result = parseAgentCommand('agent');
    expect(result).toEqual({ name: '', workspace: true, offline: false });
  });

  it('defaults a named agent to a workspace', () => {
    const result = parseAgentCommand('agent bilal');
    expect(result).toEqual({ name: 'bilal', workspace: true, offline: false });
  });

  it('accepts --no-workspace as an opt-out', () => {
    expect(parseAgentCommand('agent bilal --no-workspace')).toEqual({
      name: 'bilal', workspace: false, offline: false,
    });
  });

  it('lets --no-workspace override a positive workspace flag', () => {
    expect(parseAgentCommand('agent bilal --no-workspace -w')).toEqual({
      name: 'bilal', workspace: false, offline: false,
    });
  });

  it('extracts name and workspace flag from agent <name> --workspace', () => {
    const result = parseAgentCommand('agent bilal --workspace');
    expect(result).toEqual({ name: 'bilal', workspace: true, offline: false });
  });

  it('extracts name and workspace flag from agent <name> -w', () => {
    const result = parseAgentCommand('agent bilal -w');
    expect(result).toEqual({ name: 'bilal', workspace: true, offline: false });
  });

  it('extracts workspace flag with bare agent', () => {
    const result = parseAgentCommand('agent --workspace');
    expect(result).toEqual({ name: '', workspace: true, offline: false });
  });

  it('extracts workspace flag with bare agent -w', () => {
    const result = parseAgentCommand('agent -w');
    expect(result).toEqual({ name: '', workspace: true, offline: false });
  });

  it('lowercases the name', () => {
    const result = parseAgentCommand('agent Ahmed -w');
    expect(result).toEqual({ name: 'ahmed', workspace: true, offline: false });
  });

  it('truncates the name to the configured max length', () => {
    const result = parseAgentCommand('agent abcdefghijklmnopqrstuvwxyz');
    expect(result).toEqual({ name: 'abcdefghijklmnop', workspace: true, offline: false }); // 16 chars
  });

  it('extracts the offline flag', () => {
    const result = parseAgentCommand('agent bilal -w --offline');
    expect(result).toEqual({ name: 'bilal', workspace: true, offline: true });
  });
});

describe('parseAgentCommand — on <address> clause', () => {
  // Missing this is the most likely way to end up with a tab labelled `bekir on devbox`.
  it('keeps the address out of the tab name', () => {
    expect(parseAgentCommand('agent bekir on devbox')).toMatchObject({
      name: 'bekir', workspace: true, remote: { address: 'devbox', host: 'devbox' },
    });
  });

  it('parses a user, a host, and a remote path', () => {
    expect(parseAgentCommand('agent bekir on admin@devbox:/srv/proj')).toMatchObject({
      name: 'bekir',
      remote: { destination: 'admin@devbox', host: 'devbox', path: '/srv/proj' },
    });
  });

  it('forces workspace true without -w, and accepts -w alongside', () => {
    expect(parseAgentCommand('agent bekir on devbox')).toMatchObject({ workspace: true });
    expect(parseAgentCommand('agent bekir -w on devbox')).toMatchObject({ workspace: true });
  });

  it('keeps the offline flag apart from the clause', () => {
    expect(parseAgentCommand('agent bekir on devbox --offline')).toMatchObject({
      name: 'bekir', offline: true, remote: { host: 'devbox' },
    });
  });

  it('leaves a name merely starting with "on" alone', () => {
    expect(parseAgentCommand('agent onyx')).toMatchObject({ name: 'onyx', workspace: true, remote: undefined });
  });

  it('reports the address\'s own error rather than launching locally', () => {
    const result = parseAgentCommand('agent bekir on devbox;id');
    expect(result.remote).toBeUndefined();
    expect(result.remoteError).toContain('devbox;id');
  });

  it('reports a usage error when on has no following address', () => {
    expect(parseAgentCommand('agent bekir on').remoteError).toContain('Usage: on');
  });

  it('leaves remote unset for an ordinary launch', () => {
    expect(parseAgentCommand('agent bekir -w')).toMatchObject({ remote: undefined, remoteError: undefined });
  });
});

describe('resolveAgentName — on <address> clause', () => {
  // `resolveAgentName` runs the *unstripped* input through the same "everything after `agent`"
  // match, so it needs the clause removed too.
  it('resolves the name without the address', () => {
    expect(resolveAgentName('agent bekir on devbox', ['janus'])).toBe('bekir');
  });

  it('still picks a pool name when the clause is all there is', () => {
    const name = resolveAgentName('agent on devbox', ['janus']);
    expect(name).not.toBeNull();
    expect(name).not.toContain('devbox');
  });
});
