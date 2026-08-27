import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadOpencodeToken, getOpencodeToken } from './opencode-token.js';

describe('loadOpencodeToken', () => {
  it('returns the trimmed token when the file exists', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'opencode-token-'));
    mkdirSync(path.join(dir, '.janissary'), { recursive: true });
    writeFileSync(path.join(dir, '.janissary', 'opencode-token'), '  oc_live_abc123  \n');
    expect(loadOpencodeToken(dir)).toBe('oc_live_abc123');
    expect(getOpencodeToken()).toBe('oc_live_abc123');
  });

  it('returns undefined when the file is missing', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'opencode-token-missing-'));
    expect(loadOpencodeToken(dir)).toBeUndefined();
    expect(getOpencodeToken()).toBeUndefined();
  });

  it('returns undefined when the file is empty', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'opencode-token-empty-'));
    mkdirSync(path.join(dir, '.janissary'), { recursive: true });
    writeFileSync(path.join(dir, '.janissary', 'opencode-token'), '   \n');
    expect(loadOpencodeToken(dir)).toBeUndefined();
  });
});
