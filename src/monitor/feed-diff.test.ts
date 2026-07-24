import { describe, it, expect } from 'vitest';
import { cap, diffFeedEntry } from './feed-diff.js';

describe('cap', () => {
  it('returns text under the byte limit unchanged', () => {
    expect(cap('hello')).toBe('hello');
  });

  it('truncates at the byte boundary even when it splits a multi-byte character', () => {
    // 'é' is 2 bytes in UTF-8. Pad with 1-byte ASCII so the 2-byte char straddles offset 20,000.
    const text = `${'a'.repeat(19_999)}é${'b'.repeat(100)}`;
    const totalBytes = Buffer.byteLength(text, 'utf8');

    const result = cap(text);

    expect(result.endsWith(`\n… diff truncated (${totalBytes} bytes total)`)).toBe(true);
    const head = result.slice(0, result.indexOf('\n… diff truncated'));
    // The split lands mid-character: the head ends in the replacement character
    // rather than a whole 'é', since the cut is a byte offset, not a code-point boundary.
    expect(head).toBe(`${'a'.repeat(19_999)}�`);
  });
});

describe('diffFeedEntry', () => {
  it('returns undefined on first call with empty content', () => {
    const seen = new Map<string, string>();
    const result = diffFeedEntry(seen, 'tab1', '', 'patch');
    expect(result).toBeUndefined();
    expect(seen.get('tab1')).toBe('');
  });

  it('returns the full content on first call with non-empty content', () => {
    const seen = new Map<string, string>();
    const result = diffFeedEntry(seen, 'tab1', 'line one\n', 'patch');
    expect(result).toEqual({ tabLabel: 'tab1', entry: { input: '', output: 'line one\n' } });
  });

  it('returns undefined when content is unchanged since last call', () => {
    const seen = new Map<string, string>();
    diffFeedEntry(seen, 'tab1', 'line one\n', 'patch');
    const result = diffFeedEntry(seen, 'tab1', 'line one\n', 'patch');
    expect(result).toBeUndefined();
  });

  it('returns a unified diff when content changed since last call', () => {
    const seen = new Map<string, string>();
    diffFeedEntry(seen, 'tab1', 'line one\n', 'patch');
    const result = diffFeedEntry(seen, 'tab1', 'line two\n', 'patch');

    expect(result?.tabLabel).toBe('tab1');
    expect(result?.entry.input).toBe('');
    expect(result?.entry.output).toContain('-line one');
    expect(result?.entry.output).toContain('+line two');
    expect(seen.get('tab1')).toBe('line two\n');
  });

  it('tracks each label independently', () => {
    const seen = new Map<string, string>();
    diffFeedEntry(seen, 'tab1', 'a', 'patch');
    diffFeedEntry(seen, 'tab2', 'b', 'patch');

    expect(diffFeedEntry(seen, 'tab1', 'a', 'patch')).toBeUndefined();
    const changed = diffFeedEntry(seen, 'tab2', 'c', 'patch');
    expect(changed?.tabLabel).toBe('tab2');
  });
});
