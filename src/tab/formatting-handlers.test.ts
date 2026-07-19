import { describe, it, expect } from 'vitest';
import {
  handleCollapsedToolSteps,
  handleTerminalEntry,
  handleMessageEntry,
  handleInputOutput,
} from './formatting-handlers.js';
import type { LogEntry, BufferLine } from '../types.js';

function makeEntry(overrides: Partial<LogEntry> = {}): LogEntry {
  return { input: '', output: '', ...overrides };
}

describe('handleCollapsedToolSteps', () => {
  it('is a no-op when collapsing is disabled', () => {
    const log = [makeEntry({ acp: true })];
    const lines: BufferLine[] = [];
    const result = handleCollapsedToolSteps(log, 0, lines, false);
    expect(result).toEqual({ handled: false, newIndex: 0 });
    expect(lines).toHaveLength(0);
  });

  it('is a no-op when the entry cannot be collapsed', () => {
    const log = [makeEntry({ acp: false })];
    const lines: BufferLine[] = [];
    const result = handleCollapsedToolSteps(log, 0, lines, true);
    expect(result).toEqual({ handled: false, newIndex: 0 });
    expect(lines).toHaveLength(0);
  });

  it('collapses a run of acp tool-step entries into a single summary line', () => {
    const log = [makeEntry({ acp: true, output: 'step 1' }), makeEntry({ acp: true, output: 'step 2' })];
    const lines: BufferLine[] = [];
    const result = handleCollapsedToolSteps(log, 0, lines, true);
    expect(result).toEqual({ handled: true, newIndex: 1 });
    expect(lines).toEqual([{ type: 'collapsed', text: '2 tool steps', acp: true }]);
  });

  it('adds a spacer before the summary when prior lines exist', () => {
    const log = [makeEntry({ acp: true, output: 'step' })];
    const lines: BufferLine[] = [{ type: 'output', text: 'prior' }];
    handleCollapsedToolSteps(log, 0, lines, true);
    expect(lines[1]).toEqual({ type: 'spacer', text: '' });
  });
});

describe('handleTerminalEntry', () => {
  it('returns false and does not touch lines when there is no terminal', () => {
    const lines: BufferLine[] = [];
    expect(handleTerminalEntry(makeEntry(), lines)).toBe(false);
    expect(lines).toHaveLength(0);
  });

  it('pushes a terminal line when the entry hosts a terminal', () => {
    const terminal = { ptyId: 'p1', program: 'claude', status: 'running' as const };
    const lines: BufferLine[] = [];
    expect(handleTerminalEntry(makeEntry({ terminal }), lines)).toBe(true);
    expect(lines).toEqual([{ type: 'terminal', text: '', terminal }]);
  });

  it('adds a spacer before the terminal line when prior lines exist', () => {
    const terminal = { ptyId: 'p1', program: 'claude', status: 'running' as const };
    const lines: BufferLine[] = [{ type: 'output', text: 'prior' }];
    handleTerminalEntry(makeEntry({ terminal }), lines);
    expect(lines[1]).toEqual({ type: 'spacer', text: '' });
    expect(lines[2]).toEqual({ type: 'terminal', text: '', terminal });
  });
});

describe('handleMessageEntry', () => {
  it('returns false and does not touch lines when the entry has no sender', () => {
    const lines: BufferLine[] = [];
    expect(handleMessageEntry(makeEntry({ output: 'hi' }), lines)).toBe(false);
    expect(lines).toHaveLength(0);
  });

  it('formats and pushes lines for a message entry', () => {
    const lines: BufferLine[] = [];
    const handled = handleMessageEntry(makeEntry({ from: 'agent', output: 'hello' }), lines);
    expect(handled).toBe(true);
    expect(lines.length).toBeGreaterThan(0);
  });
});

describe('handleInputOutput', () => {
  it('returns false and does not touch lines when there is no input or output', () => {
    const lines: BufferLine[] = [];
    expect(handleInputOutput(makeEntry(), lines)).toBe(false);
    expect(lines).toHaveLength(0);
  });

  it('pushes a prompt line for input', () => {
    const lines: BufferLine[] = [];
    handleInputOutput(makeEntry({ input: 'ls -la' }), lines);
    expect(lines).toEqual([{ type: 'prompt', text: 'ls -la', cwd: undefined, acp: undefined, running: undefined }]);
  });

  it('pushes an output line per line of plain output', () => {
    const lines: BufferLine[] = [];
    handleInputOutput(makeEntry({ output: 'a\nb' }), lines);
    expect(lines).toEqual([
      { type: 'output', text: 'a', acp: undefined },
      { type: 'output', text: 'b', acp: undefined },
    ]);
  });

  it('pushes a single markdown line when the entry is markdown', () => {
    const lines: BufferLine[] = [];
    handleInputOutput(makeEntry({ output: '# hi\nworld', markdown: true }), lines);
    expect(lines).toEqual([{ type: 'markdown', text: '# hi\nworld' }]);
  });

  it('adds a spacer before the entry when prior lines exist', () => {
    const lines: BufferLine[] = [{ type: 'output', text: 'prior' }];
    handleInputOutput(makeEntry({ output: 'next' }), lines);
    expect(lines[1]).toEqual({ type: 'spacer', text: '' });
  });
});
