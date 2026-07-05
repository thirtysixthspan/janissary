import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadGithubToken, getGithubToken } from './github-token.js';

describe('loadGithubToken', () => {
  it('returns the trimmed token when the file exists', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'github-token-'));
    mkdirSync(path.join(dir, '.janissary'), { recursive: true });
    writeFileSync(path.join(dir, '.janissary', 'github-token'), '  ghp_abc123  \n');
    expect(loadGithubToken(dir)).toBe('ghp_abc123');
    expect(getGithubToken()).toBe('ghp_abc123');
  });

  it('returns undefined when the file is missing', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'github-token-missing-'));
    expect(loadGithubToken(dir)).toBeUndefined();
    expect(getGithubToken()).toBeUndefined();
  });

  it('returns undefined when the file is empty', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'github-token-empty-'));
    mkdirSync(path.join(dir, '.janissary'), { recursive: true });
    writeFileSync(path.join(dir, '.janissary', 'github-token'), '   \n');
    expect(loadGithubToken(dir)).toBeUndefined();
  });
});
