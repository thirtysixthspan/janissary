import { describe, expect, it } from 'vitest';
import { nextRestoreRevision } from './restore.js';

describe('nextRestoreRevision', () => {
  it('returns successive integers, each above the last', () => {
    const first = nextRestoreRevision();
    const second = nextRestoreRevision();

    expect(Number.isSafeInteger(first)).toBe(true);
    expect(Number.isSafeInteger(second)).toBe(true);
    expect(second).toBeGreaterThan(first);
  });
});
