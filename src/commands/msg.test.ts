import { describe, it, expect, vi } from 'vitest';
import { command } from './msg.js';

describe('msg command', () => {
  it('has the correct name', () => {
    expect(command.name).toBe('msg');
  });

  it('matches msg commands', () => {
    expect(command.match('msg bilal info hi')).toBe(true);
    expect(command.match('MSG bilal info hi')).toBe(true);
    expect(command.match('msg')).toBe(true);
  });

  it('does not match non-msg input', () => {
    expect(command.match('message')).toBe(false);
    expect(command.match('ms g')).toBe(false);
    expect(command.match('clear')).toBe(false);
  });
});

describe('msg command run', () => {
  const makeManagers = (sendResult: boolean) => {
    const appended: { input: string; output: string }[] = [];
    const send = vi.fn(() => sendResult);
    const managers = {
      tab: { append: (_label: string, entry: { input: string; output: string }) => { appended.push(entry); } },
      communication: { send },
    };
    return { appended, send, managers };
  };

  it('shows a usage error for malformed input', () => {
    const { appended, managers } = makeManagers(true);
    command.run('msg bilal', { label: 'janus', index: 0 }, managers as never);
    expect(appended).toEqual([{ input: 'msg bilal', output: 'Usage: msg <agent> <info|request|command> <text>' }]);
  });

  it('reports an unknown agent when send fails to find a recipient', () => {
    const { appended, send, managers } = makeManagers(false);
    command.run('msg bilal info hi', { label: 'janus', index: 0 }, managers as never);
    expect(send).toHaveBeenCalledWith({ from: 'janus', to: 'bilal', kind: 'info', text: 'hi' });
    expect(appended).toEqual([{ input: 'msg bilal info hi', output: 'No agent named "bilal".' }]);
  });

  it('appends a delivery confirmation on success', () => {
    const { appended, managers } = makeManagers(true);
    command.run('msg bilal request please review', { label: 'janus', index: 0 }, managers as never);
    expect(appended).toEqual([{ input: 'msg bilal request please review', output: '→ bilal (request): please review' }]);
  });
});
