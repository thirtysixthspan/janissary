import { describe, it, expect, vi } from 'vitest';
import { command } from './ask-reset.js';
import type { Managers } from '../managers.js';
import type { LogEntry } from '../tab/types.js';
import { makeTab } from '../tab/index.js';
import { backgroundRepliesFor } from '../tab/background-replies.js';

describe('ask-reset command', () => {
  it.each([
    [true, 'ACP session reset — next ask prompt will start fresh.'],
    [false, 'No active ACP session to reset.'],
  ])('delivers one tagged completed confirmation (session: %s) under the exact input', (hadSession, output) => {
    const tab = makeTab('docked', '#fff');
    const close = vi.fn(() => hadSession);
    const append = vi.fn((_label: string, entry: LogEntry) => { tab.log.push(entry); });
    const managers = { tab: { byLabel: () => tab, append }, acp: { close } } as unknown as Managers;
    const line = '  /AsK   ReSeT  ';
    command.run('AsK   ReSeT', { label: 'docked', index: 0 }, managers, {
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
    command.run('ask reset', { label: 'shell', index: 0 }, managers);
    command.run('ask reset', { label: 'shell', index: 0 }, managers);
    expect(tab.log.map((entry) => entry.input)).toEqual(['ask reset', 'ask reset']);
    expect(new Set(tab.log.map((entry) => entry.background)).size).toBe(2);
  });

  it('has the correct name', () => {
    expect(command.name).toBe('ask-reset');
  });

  it('matches "ask reset" case-insensitively', () => {
    expect(command.match('ask reset')).toBe(true);
    expect(command.match('ASK RESET')).toBe(true);
    expect(command.match('Ask Reset')).toBe(true);
  });

  it('matches with extra whitespace', () => {
    expect(command.match('ask  reset')).toBe(true);
  });

  it('does not match bare "ask"', () => {
    expect(command.match('ask')).toBe(false);
  });

  it('does not match "ask resume"', () => {
    expect(command.match('ask resume')).toBe(false);
  });

  it('does not match "ask" with a prompt', () => {
    expect(command.match('ask summarize this repo')).toBe(false);
  });

  it('no longer answers to the former "acp reset"', () => {
    expect(command.match('acp reset')).toBe(false);
  });
});
