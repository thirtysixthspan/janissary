import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { command, parseSendCommand } from './send.js';

describe('send command', () => {
  it('has the correct name', () => {
    expect(command.name).toBe('send');
  });

  it('matches send commands', () => {
    expect(command.match('send claude /standup')).toBe(true);
    expect(command.match('SEND claude /standup')).toBe(true);
    expect(command.match('send')).toBe(true);
  });

  it('does not match non-send input', () => {
    expect(command.match('sender')).toBe(false);
    expect(command.match('sen d')).toBe(false);
    expect(command.match('clear')).toBe(false);
  });
});

describe('parseSendCommand', () => {
  it('errors with no args', () => {
    expect(parseSendCommand('send')).toEqual({ error: 'Usage: send <label> <text>' });
  });

  it('errors with no text', () => {
    expect(parseSendCommand('send claude')).toEqual({ error: 'No text to send.' });
  });

  it('parses a label and text', () => {
    expect(parseSendCommand('send claude /standup')).toEqual({ label: 'claude', text: '/standup' });
  });

  it('joins multi-word text', () => {
    expect(parseSendCommand('send worker db vacuum')).toEqual({ label: 'worker', text: 'db vacuum' });
  });
});

describe('send delivery', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function run(command_: string, harness: { name: string; status: string } | undefined): ReturnType<typeof vi.fn> {
    const tab = {
      label: 'target', index: 0, title: 'target', log: [], cmdHistory: [],
      view: 'harness', harness: harness && { ptyId: 'p1', ...harness },
    };
    const input = vi.fn();
    const managers = {
      tab: { tabs: [tab], append: vi.fn() },
      pty: { input },
      command: { dispatchTo: vi.fn() },
    };
    command.run(`send target fix the tests`, tab, managers as never);
    return input;
  }

  it('frames the text as a bracketed paste when the target is a codex harness', () => {
    const input = run('send target fix the tests', { name: 'codex', status: 'running' });
    expect(input).toHaveBeenCalledWith('p1', '\u{1B}[200~fix the tests\u{1B}[201~');
    vi.advanceTimersByTime(50);
    expect(input).toHaveBeenCalledWith('p1', '\r');
  });

  it('writes the text plain when the target is any other harness', () => {
    const input = run('send target fix the tests', { name: 'claude', status: 'running' });
    expect(input).toHaveBeenCalledWith('p1', 'fix the tests');
    vi.advanceTimersByTime(50);
    expect(input).toHaveBeenCalledWith('p1', '\r');
  });
});
