import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync, existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync } from 'node:fs';
import { initLogDir, appendEntry, getLogDir, getTimeStr as getTimeString } from './logger.js';

function getDateString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

describe('logger', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'logger-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates the log directory on init', () => {
    initLogDir(tmpDir);
    expect(existsSync(path.join(tmpDir, '.janissary', 'log'))).toBe(true);
  });

  it('getLogDir returns the log directory path', () => {
    initLogDir(tmpDir);
    expect(getLogDir()).toBe(path.join(tmpDir, '.janissary', 'log'));
  });

  it('appends a JSON line to today\'s log file', () => {
    initLogDir(tmpDir);
    appendEntry({ timestamp: '22:55:20.690', agent: 'janus', text: 'hello' });
    appendEntry({ timestamp: '22:55:21.123', agent: 'bilal', text: 'world' });

    const logPath = path.join(tmpDir, '.janissary', 'log', `${getDateString()}.json`);
    expect(existsSync(logPath)).toBe(true);
    const lines = readFileSync(logPath, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0])).toEqual({ timestamp: '22:55:20.690', agent: 'janus', text: 'hello' });
    expect(JSON.parse(lines[1])).toEqual({ timestamp: '22:55:21.123', agent: 'bilal', text: 'world' });
  });

  it('appends to an existing log file', () => {
    initLogDir(tmpDir);
    appendEntry({ timestamp: '22:55:20.690', agent: 'janus', text: 'first' });
    appendEntry({ timestamp: '22:55:21.000', agent: 'janus', text: 'second' });

    const logPath = path.join(tmpDir, '.janissary', 'log', `${getDateString()}.json`);
    const lines = readFileSync(logPath, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(2);
  });

  it('writes valid JSON on each line', () => {
    initLogDir(tmpDir);
    appendEntry({ timestamp: '22:55:20.690', agent: 'janus', text: 'line1' });
    appendEntry({ timestamp: '22:55:21.000', agent: 'bilal', text: 'line2' });

    const logPath = path.join(tmpDir, '.janissary', 'log', `${getDateString()}.json`);
    const content = readFileSync(logPath, 'utf8').trim();
    for (const line of content.split('\n')) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });

  it('handles empty text', () => {
    initLogDir(tmpDir);
    appendEntry({ timestamp: '22:55:20.690', agent: 'janus', text: '' });

    const logPath = path.join(tmpDir, '.janissary', 'log', `${getDateString()}.json`);
    const lines = readFileSync(logPath, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]).text).toBe('');
  });

  it('handles special characters in text', () => {
    initLogDir(tmpDir);
    const text = 'line1\nline2\twith\ttabs\u{2603}';
    appendEntry({ timestamp: '22:55:20.690', agent: 'janus', text });

    const logPath = path.join(tmpDir, '.janissary', 'log', `${getDateString()}.json`);
    const lines = readFileSync(logPath, 'utf8').trim().split('\n');
    expect(JSON.parse(lines[0]).text).toBe(text);
  });

  it('getTimeStr returns HH:MM:SS.mmm format', () => {
    const ts = getTimeString();
    expect(ts).toMatch(/^\d{2}:\d{2}:\d{2}\.\d{3}$/);
  });
});
