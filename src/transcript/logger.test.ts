import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync, existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync } from 'node:fs';
import { TranscriptLogger } from './logger.js';
import { messageBus } from '../bus.js';
import { getDateStr, getTimeStr as getTimeString } from '../datetime.js';
import type { LogEntry, Tab } from '../types.js';

const makeTab = (label: string, log: LogEntry[] = []): Readonly<Tab> =>
  ({ label, log }) as Readonly<Tab>;

const defaultEntry: LogEntry = { input: 'cmd', output: 'out' };
const appendedEvent = (label = 'janus', entry: LogEntry = defaultEntry) => ({
  type: 'entry:appended' as const,
  tabLabel: label,
  entry,
  tab: makeTab(label, [entry]),
});

describe('logger I/O', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'logger-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates the log directory on init', () => {
    new TranscriptLogger(tmpDir);
    expect(existsSync(path.join(tmpDir, '.janissary', 'log'))).toBe(true);
  });

  it('logDir returns the log directory path', () => {
    new TranscriptLogger(tmpDir);
    expect(TranscriptLogger.logDir).toBe(path.join(tmpDir, '.janissary', 'log'));
  });

  it('appends a JSON line to today\'s log file', () => {
    new TranscriptLogger(tmpDir);
    TranscriptLogger.append({ timestamp: '22:55:20.690', agent: 'janus', text: 'hello' });
    TranscriptLogger.append({ timestamp: '22:55:21.123', agent: 'bilal', text: 'world' });

    const logPath = path.join(tmpDir, '.janissary', 'log', `${getDateStr()}.json`);
    expect(existsSync(logPath)).toBe(true);
    const lines = readFileSync(logPath, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0])).toEqual({ timestamp: '22:55:20.690', agent: 'janus', text: 'hello' });
    expect(JSON.parse(lines[1])).toEqual({ timestamp: '22:55:21.123', agent: 'bilal', text: 'world' });
  });

  it('appends to an existing log file', () => {
    new TranscriptLogger(tmpDir);
    TranscriptLogger.append({ timestamp: '22:55:20.690', agent: 'janus', text: 'first' });
    TranscriptLogger.append({ timestamp: '22:55:21.000', agent: 'janus', text: 'second' });

    const logPath = path.join(tmpDir, '.janissary', 'log', `${getDateStr()}.json`);
    const lines = readFileSync(logPath, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(2);
  });

  it('writes valid JSON on each line', () => {
    new TranscriptLogger(tmpDir);
    TranscriptLogger.append({ timestamp: '22:55:20.690', agent: 'janus', text: 'line1' });
    TranscriptLogger.append({ timestamp: '22:55:21.000', agent: 'bilal', text: 'line2' });

    const logPath = path.join(tmpDir, '.janissary', 'log', `${getDateStr()}.json`);
    const content = readFileSync(logPath, 'utf8').trim();
    for (const line of content.split('\n')) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });

  it('handles empty text', () => {
    new TranscriptLogger(tmpDir);
    TranscriptLogger.append({ timestamp: '22:55:20.690', agent: 'janus', text: '' });

    const logPath = path.join(tmpDir, '.janissary', 'log', `${getDateStr()}.json`);
    const lines = readFileSync(logPath, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]).text).toBe('');
  });

  it('handles special characters in text', () => {
    new TranscriptLogger(tmpDir);
    const text = 'line1\nline2\twith\ttabs\u{2603}';
    TranscriptLogger.append({ timestamp: '22:55:20.690', agent: 'janus', text });

    const logPath = path.join(tmpDir, '.janissary', 'log', `${getDateStr()}.json`);
    const lines = readFileSync(logPath, 'utf8').trim().split('\n');
    expect(JSON.parse(lines[0]).text).toBe(text);
  });

  it('getTimeStr returns HH:MM:SS.mmm format', () => {
    const ts = getTimeString();
    expect(ts).toMatch(/^\d{2}:\d{2}:\d{2}\.\d{3}$/);
  });
});

describe('TranscriptLogger', () => {
  beforeEach(() => { messageBus.clear(); });
  afterEach(() => { messageBus.clear(); });

  it('constructs without error', () => {
    expect(() => new TranscriptLogger()).not.toThrow();
  });

  it('does not throw on entry:appended', () => {
    new TranscriptLogger();
    expect(() => messageBus.emit('transcript', appendedEvent())).not.toThrow();
  });

  it('does not throw for other event types', () => {
    new TranscriptLogger();
    expect(() => messageBus.emit('transcript', { type: 'tab:cleared', tabLabel: 'janus' })).not.toThrow();
    expect(() => messageBus.emit('transcript', { type: 'tab:removed', tabLabel: 'janus' })).not.toThrow();
  });

  it('unsubscribe: no error after detach', () => {
    const logger = new TranscriptLogger();
    logger.unsubscribe();
    expect(() => messageBus.emit('transcript', appendedEvent())).not.toThrow();
  });
});
