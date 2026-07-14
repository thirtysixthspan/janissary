import { describe, expect, it } from 'vitest';
import { generateSessionDelimiter, frameEntry, TRUST_FRAMING_INSTRUCTIONS } from './framing.js';

describe('generateSessionDelimiter', () => {
  it('generates a unique token each call', () => {
    const a = generateSessionDelimiter();
    const b = generateSessionDelimiter();
    expect(a).not.toBe(b);
  });

  it('is a non-empty string with a recognizable prefix', () => {
    const delimiter = generateSessionDelimiter();
    expect(delimiter.length).toBeGreaterThan(0);
    expect(delimiter).toMatch(/^janus-monitor-/);
  });
});

describe('frameEntry', () => {
  it('wraps the entry content between two copies of the delimiter', () => {
    const wrapped = frameEntry('notes', { input: 'cat .env', output: 'SECRET=hunter2' }, 'DELIM-1');
    const matches = wrapped.match(/DELIM-1/g);
    expect(matches).toHaveLength(2);
    expect(wrapped).toContain('[notes]');
    expect(wrapped).toContain('cat .env');
    expect(wrapped).toContain('SECRET=hunter2');
  });

  it('keeps the tab label heading outside the delimited block', () => {
    const wrapped = frameEntry('notes', { input: '', output: 'hello' }, 'DELIM-2');
    const firstDelimiterIndex = wrapped.indexOf('DELIM-2');
    const labelIndex = wrapped.indexOf('[notes]');
    expect(labelIndex).toBeLessThan(firstDelimiterIndex);
  });
});

describe('TRUST_FRAMING_INSTRUCTIONS', () => {
  it('includes the given delimiter', () => {
    expect(TRUST_FRAMING_INSTRUCTIONS('DELIM-3')).toContain('DELIM-3');
  });
});
