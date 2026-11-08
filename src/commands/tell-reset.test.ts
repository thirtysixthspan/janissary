import { describe, it, expect, vi } from 'vitest';
import { command } from './tell-reset.js';
import type { Managers } from '../managers.js';
import type { LogEntry } from '../tab/types.js';
import { makeTab } from '../tab/index.js';
import { backgroundRepliesFor } from '../tab/background-replies.js';

describe('tell-reset command', () => {
  it.each([
    [true, 'ACP tell session reset — next tell prompt will start fresh.'],
    [false, 'No active ACP tell session to reset.'],
  ])('delivers one tagged confirmation for only the tell role (session: %s)', (hadSession, output) => {
    const tab = makeTab('docked', '#fff');
    const close = vi.fn(() => hadSession);
    const append = vi.fn((_label: string, entry: LogEntry) => { tab.log.push(entry); });
    const managers = { tab: { byLabel: () => tab, append }, acp: { close } } as unknown as Managers;
    const line = '  /TeLl   ReSeT  ';
    command.run('Tell   Reset', { label: 'docked', index: 0 }, managers, {
      runId: 'run', invocationId: 'invocation', caller: { label: 'docked', cwd: '/repo', context: [] },
      signal: new AbortController().signal, line,
    });

    expect(command.coreResponse).toBe(true);
    expect(close).toHaveBeenCalledExactlyOnceWith('docked', undefined, 'tell');
    expect(append).toHaveBeenCalledExactlyOnceWith('docked', {
      input: line, output, background: expect.any(String),
    });
    expect(tab.log).toHaveLength(1);
    expect(tab.log[0].running).not.toBe(true);
    expect(tab.runtime?.acpEntries?.has(tab.log[0])).toBe(true);
    expect(backgroundRepliesFor(tab)).toEqual([{ id: tab.log[0].background, output, line }]);
  });

  it('falls back to the command argument and gives each invocation a fresh id', () => {
    const tab = makeTab('shell', '#fff');
    const managers = {
      tab: { byLabel: () => tab, append: (_label: string, entry: LogEntry) => { tab.log.push(entry); } },
      acp: { close: () => false },
    } as unknown as Managers;
    command.run('tell reset', { label: 'shell', index: 0 }, managers);
    command.run('tell reset', { label: 'shell', index: 0 }, managers);
    expect(tab.log.map((entry) => entry.input)).toEqual(['tell reset', 'tell reset']);
    expect(new Set(tab.log.map((entry) => entry.background)).size).toBe(2);
  });

  it('has the correct name', () => {
    expect(command.name).toBe('tell-reset');
  });

  it('matches tell reset case-insensitively and with extra whitespace', () => {
    expect(command.match('tell reset')).toBe(true);
    expect(command.match('TELL RESET')).toBe(true);
    expect(command.match('Tell   Reset')).toBe(true);
    expect(command.match('tell reset extra')).toBe(true);
  });

  it('does not match bare tell or a different tell command', () => {
    expect(command.match('tell')).toBe(false);
    expect(command.match('tell resume')).toBe(false);
    expect(command.match('tell resetful')).toBe(false);
  });
});
