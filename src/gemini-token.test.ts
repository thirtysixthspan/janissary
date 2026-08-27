import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadGeminiToken, getGeminiToken } from './gemini-token.js';

describe('loadGeminiToken', () => {
  it('returns the trimmed token when the file exists', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'gemini-token-'));
    mkdirSync(path.join(dir, '.janissary'), { recursive: true });
    writeFileSync(path.join(dir, '.janissary', 'gemini-token'), '  AIzaSyExample123  \n');
    expect(loadGeminiToken(dir)).toBe('AIzaSyExample123');
    expect(getGeminiToken()).toBe('AIzaSyExample123');
  });

  it('returns undefined when the file is missing', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'gemini-token-missing-'));
    expect(loadGeminiToken(dir)).toBeUndefined();
    expect(getGeminiToken()).toBeUndefined();
  });

  it('returns undefined when the file is empty', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'gemini-token-empty-'));
    mkdirSync(path.join(dir, '.janissary'), { recursive: true });
    writeFileSync(path.join(dir, '.janissary', 'gemini-token'), '   \n');
    expect(loadGeminiToken(dir)).toBeUndefined();
  });
});
