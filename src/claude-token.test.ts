import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadClaudeToken, getClaudeToken } from './claude-token.js';

describe('loadClaudeToken', () => {
  it('returns the trimmed token when the file exists', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'claude-token-'));
    mkdirSync(path.join(dir, '.janissary'), { recursive: true });
    writeFileSync(path.join(dir, '.janissary', 'claude-token'), '  sk-ant-oat01-abc123  \n');
    expect(loadClaudeToken(dir)).toBe('sk-ant-oat01-abc123');
    expect(getClaudeToken()).toBe('sk-ant-oat01-abc123');
  });

  it('returns undefined when the file is missing', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'claude-token-missing-'));
    expect(loadClaudeToken(dir)).toBeUndefined();
    expect(getClaudeToken()).toBeUndefined();
  });

  it('returns undefined when the file is empty', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'claude-token-empty-'));
    mkdirSync(path.join(dir, '.janissary'), { recursive: true });
    writeFileSync(path.join(dir, '.janissary', 'claude-token'), '   \n');
    expect(loadClaudeToken(dir)).toBeUndefined();
  });
});
