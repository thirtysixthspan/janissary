import { describe, it, expect, vi } from 'vitest';
import type { Managers } from '../managers.js';
import type { McpStatus } from '../mcp/manager.js';
import type { CommandInvocationContext } from './types.js';
import { command } from './mcp.js';

const TOKEN = 'never-print-this-token';
const RUNNING: McpStatus = { status: 'running', url: 'http://127.0.0.1:43127/mcp', port: 43_127 };
const STOPPED: McpStatus = { status: 'not running', reason: 'not started' };
const RUNNING_OUTPUT = 'status: running\nurl: http://127.0.0.1:43127/mcp\nport: 43127\ntools: question';
const STOPPED_OUTPUT = 'status: not running\nreason: not started';

type Entry = { input: string; output: string };
type Append = (label: string, entry: Entry) => void;

function run(status: McpStatus) {
  const append = vi.fn<Append>();
  const appendForInvocation = vi.fn<(label: string, entry: Entry, invocationId: string) => void>();
  const statusFor = vi.fn(() => status);
  const localLaunch = vi.fn(() => ({ url: status.status === 'running' ? status.url : '', token: TOKEN }));
  const managers = {
    tab: { append, appendForInvocation },
    mcp: { status: statusFor, localLaunch },
  } as unknown as Managers;
  command.run('mcp', { label: 'janus', index: 0 }, managers);
  return { append, appendForInvocation, statusFor, localLaunch };
}

function outputOf(append: ReturnType<typeof vi.fn<Append>>): string {
  const call = append.mock.calls[0];
  if (!call) throw new Error('no output was appended');
  return call[1].output;
}

describe('mcp command', () => {
  it('has the correct name', () => {
    expect(command.name).toBe('mcp');
  });

  it('matches the bare token case-insensitively', () => {
    expect(command.match('mcp')).toBe(true);
    expect(command.match('MCP')).toBe(true);
    expect(command.match('Mcp')).toBe(true);
  });

  it('matches no form with extra words or another command', () => {
    for (const input of ['mcp status', 'mcp start', 'mcpfoo', 'next', '']) {
      expect(command.match(input)).toBe(false);
    }
  });

  it('prints the four-line running block', () => {
    const { append } = run(RUNNING);
    expect(outputOf(append)).toBe(RUNNING_OUTPUT);
    expect(outputOf(append).split('\n')).toEqual([
      'status: running',
      'url: http://127.0.0.1:43127/mcp',
      'port: 43127',
      'tools: question',
    ]);
    expect(append).toHaveBeenCalledWith('janus', { input: 'mcp', output: RUNNING_OUTPUT });
  });

  it('prints only status and reason when the server is not running', () => {
    const { append } = run(STOPPED);
    expect(outputOf(append)).toBe(STOPPED_OUTPUT);
    expect(outputOf(append).split('\n')).toEqual([
      'status: not running',
      'reason: not started',
    ]);
    expect(outputOf(append)).not.toContain('tools:');
    expect(outputOf(append)).not.toContain('url:');
  });

  it('never prints the token in either state and never reads localLaunch', () => {
    for (const status of [RUNNING, STOPPED]) {
      const { append, localLaunch } = run(status);
      const output = outputOf(append);
      expect(output).not.toContain(TOKEN);
      expect(output.toLowerCase()).not.toContain('token');
      expect(localLaunch).not.toHaveBeenCalled();
    }
  });

  it('reads state only through the manager status API', () => {
    const { statusFor } = run(RUNNING);
    expect(statusFor).toHaveBeenCalledTimes(1);
  });

  it('appends through the invocation path when invoked', () => {
    const append = vi.fn<Append>();
    const appendForInvocation = vi.fn<(label: string, entry: Entry, invocationId: string) => void>();
    const managers = { tab: { append, appendForInvocation }, mcp: { status: () => RUNNING } } as unknown as Managers;
    const invocation = { invocationId: 'inv-1' } as CommandInvocationContext;

    command.run('mcp', { label: 'janus', index: 0 }, managers, invocation);

    expect(append).not.toHaveBeenCalled();
    expect(appendForInvocation).toHaveBeenCalledWith('janus', { input: 'mcp', output: RUNNING_OUTPUT }, 'inv-1');
  });
});
