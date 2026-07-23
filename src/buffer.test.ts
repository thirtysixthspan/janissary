import { describe, it, expect } from 'vitest';
import { tryCollapseToolSteps, formatMessageContent } from './buffer.js';
import type { LogEntry } from './types.js';

const acpEntry = (extra: Partial<LogEntry> = {}): LogEntry => ({ input: '', output: 'did a thing', acp: true, ...extra });

describe('tryCollapseToolSteps', () => {
  it('returns null when the entry is not an acp step', () => {
    const log: LogEntry[] = [{ input: 'x', output: 'y' }];
    expect(tryCollapseToolSteps(log, 0)).toBeNull();
  });

  it('returns null for a cross-agent acp entry (has `from`)', () => {
    const log: LogEntry[] = [acpEntry({ from: 'bob' })];
    expect(tryCollapseToolSteps(log, 0)).toBeNull();
  });

  it('counts a single acp step', () => {
    const log: LogEntry[] = [acpEntry()];
    expect(tryCollapseToolSteps(log, 0)).toEqual({ count: 1, newIndex: 0 });
  });

  it('counts contiguous acp steps and stops at the first non-acp entry', () => {
    const log: LogEntry[] = [acpEntry(), acpEntry(), { input: 'done', output: 'final answer' }];
    expect(tryCollapseToolSteps(log, 0)).toEqual({ count: 2, newIndex: 1 });
  });

  it('skips empty entries without breaking the run', () => {
    const log: LogEntry[] = [acpEntry(), { input: '', output: '' }, acpEntry()];
    expect(tryCollapseToolSteps(log, 0)).toEqual({ count: 2, newIndex: 2 });
  });

  it('stops the run at a from-bearing acp entry', () => {
    const log: LogEntry[] = [acpEntry(), acpEntry({ from: 'bob' })];
    expect(tryCollapseToolSteps(log, 0)).toEqual({ count: 1, newIndex: 0 });
  });

  it('runs to the end of the log when every remaining entry is an acp step', () => {
    const log: LogEntry[] = [acpEntry(), acpEntry(), acpEntry()];
    expect(tryCollapseToolSteps(log, 0)).toEqual({ count: 3, newIndex: 2 });
  });
});

describe('formatMessageContent', () => {
  it('defaults to "info" when msgKind is unset', () => {
    const entry: LogEntry = { input: '', output: '', from: 'bob', fromColor: '#fff' };
    const [line] = formatMessageContent(entry, ['hi there']);
    expect(line.msgKind).toBe('info');
  });

  it('formats a response: an empty header line, then every part as output', () => {
    const entry: LogEntry = { input: '', output: '', from: 'bob', fromColor: '#fff', msgKind: 'response' };
    const lines = formatMessageContent(entry, ['line one', 'line two']);
    expect(lines).toEqual([
      { type: 'message', text: '', from: 'bob', fromColor: '#fff', msgKind: 'response' },
      { type: 'output', text: 'line one', fromColor: '#fff' },
      { type: 'output', text: 'line two', fromColor: '#fff' },
    ]);
  });

  it('formats a non-response message: the first part on the header line', () => {
    const entry: LogEntry = { input: '', output: '', from: 'bob', fromColor: '#fff', msgKind: 'request' };
    const lines = formatMessageContent(entry, ['need a review']);
    expect(lines).toEqual([
      { type: 'message', text: 'need a review', from: 'bob', fromColor: '#fff', msgKind: 'request' },
    ]);
  });

  it('formats a non-response message with extra parts as trailing output lines', () => {
    const entry: LogEntry = { input: '', output: '', from: 'bob', fromColor: '#fff', msgKind: 'info' };
    const lines = formatMessageContent(entry, ['heads up', 'line two', 'line three']);
    expect(lines).toEqual([
      { type: 'message', text: 'heads up', from: 'bob', fromColor: '#fff', msgKind: 'info' },
      { type: 'output', text: 'line two', fromColor: '#fff' },
      { type: 'output', text: 'line three', fromColor: '#fff' },
    ]);
  });

  it('handles an empty parts array for a non-response message', () => {
    const entry: LogEntry = { input: '', output: '', from: 'bob', fromColor: '#fff', msgKind: 'info' };
    const lines = formatMessageContent(entry, []);
    expect(lines).toEqual([{ type: 'message', text: '', from: 'bob', fromColor: '#fff', msgKind: 'info' }]);
  });

  it('copies openFile onto the message line, but not onto trailing output lines', () => {
    const entry: LogEntry = { input: '', output: '', from: 'bob', fromColor: '#fff', msgKind: 'info', openFile: '/captures/bob-now.txt' };
    const lines = formatMessageContent(entry, ['heads up', 'more']);
    expect(lines[0]).toEqual({ type: 'message', text: 'heads up', from: 'bob', fromColor: '#fff', msgKind: 'info', openFile: '/captures/bob-now.txt' });
    expect(lines[1].openFile).toBeUndefined();
  });

  it('copies openFile onto a response message header line', () => {
    const entry: LogEntry = { input: '', output: '', from: 'bob', fromColor: '#fff', msgKind: 'response', openFile: '/captures/bob-now.txt' };
    const [header] = formatMessageContent(entry, ['reply']);
    expect(header.openFile).toBe('/captures/bob-now.txt');
  });

  it('copies an owning-tab link onto the message line', () => {
    const entry: LogEntry = {
      input: '',
      output: '',
      from: 'bob',
      msgKind: 'info',
      openTab: 'bob',
    };
    const [line] = formatMessageContent(entry, ['Question from bob']);
    expect(line.openTab).toBe('bob');
  });
});
