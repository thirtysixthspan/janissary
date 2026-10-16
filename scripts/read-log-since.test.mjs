import { appendFileSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readLogSince } from '../bin/read-log-since.mjs';

const STALE_LINE = '__JANUS_URL__ http://127.0.0.1:1/?token=stale\n';

describe('readLogSince', () => {
  let scratch;
  let logPath;

  beforeEach(() => {
    scratch = mkdtempSync(path.join(os.tmpdir(), 'janus-log-since-'));
    logPath = path.join(scratch, 'server.log');
    writeFileSync(logPath, STALE_LINE);
  });

  afterEach(() => { rmSync(scratch, { recursive: true, force: true }); });

  it('returns only what was appended after the offset', () => {
    const offset = statSync(logPath).size;
    appendFileSync(logPath, '__JANUS_URL__ http://127.0.0.1:2/?token=fresh\n');

    expect(readLogSince(logPath, offset)).toBe('__JANUS_URL__ http://127.0.0.1:2/?token=fresh\n');
  });

  it('returns nothing when no new output has been written yet', () => {
    expect(readLogSince(logPath, statSync(logPath).size)).toBe('');
  });

  it('returns nothing when the log was truncated below the offset', () => {
    const offset = statSync(logPath).size;
    writeFileSync(logPath, 'x\n');

    expect(readLogSince(logPath, offset)).toBe('');
  });

  it('returns nothing when the log does not exist', () => {
    expect(readLogSince(path.join(scratch, 'missing.log'), 0)).toBe('');
  });
});
