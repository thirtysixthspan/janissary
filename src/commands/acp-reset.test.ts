import { describe, it, expect, vi } from 'vitest';
import { command } from './acp-reset.js';
import type { Managers } from '../managers.js';
import type { LogEntry } from '../tab/types.js';
import { makeTab } from '../tab/index.js';
import { backgroundRepliesFor } from '../tab/background-replies.js';

describe('acp-reset command', () => {
  it.each([
    [true, 'ACP session reset — next acp prompt will start fresh.'],
    [false, 'No active ACP session to reset.'],
  ])('delivers one tagged completed confirmation (session: %s) under the exact input', (hadSession, output) => {
    const tab = makeTab('docked', '#fff');
    const close = vi.fn(() => hadSession);
    const append = vi.fn((_label: string, entry: LogEntry) => { tab.log.push(entry); });
    const managers = { tab: { byLabel: () => tab, append }, acp: { close } } as unknown as Managers;
    const line = '  /AcP   ReSeT  ';
    command.run('AcP   ReSeT', { label: 'docked', index: 0 }, managers, {
      runId: 'run', invocationId: 'invocation', caller: { label: 'docked', cwd: '/repo', context: [] },
      signal: new AbortController().signal, line,
    });

    expect(command.coreResponse).toBe(true);
    expect(close).toHaveBeenCalledExactlyOnceWith('docked');
    expect(append).toHaveBeenCalledExactlyOnceWith('docked', { input: line, output, background: expect.any(String) });
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
    command.run('acp reset', { label: 'shell', index: 0 }, managers);
    command.run('acp reset', { label: 'shell', index: 0 }, managers);
    expect(tab.log.map((entry) => entry.input)).toEqual(['acp reset', 'acp reset']);
    expect(new Set(tab.log.map((entry) => entry.background)).size).toBe(2);
  });

  it('has the correct name', () => {
    expect(command.name).toBe('acp-reset');
  });

  it('matches "acp reset" case-insensitively', () => {
    expect(command.match('acp reset')).toBe(true);
    expect(command.match('ACP RESET')).toBe(true);
    expect(command.match('Acp Reset')).toBe(true);
  });

  it('matches with extra whitespace', () => {
    expect(command.match('acp  reset')).toBe(true);
  });

  it('does not match bare "acp"', () => {
    expect(command.match('acp')).toBe(false);
  });

  it('does not match "acp resume"', () => {
    expect(command.match('acp resume')).toBe(false);
  });

  it('does not match "acp" with a prompt', () => {
    expect(command.match('acp summarize this repo')).toBe(false);
  });
});
