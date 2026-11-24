import { describe, expect, it } from 'vitest';
import { serverLogFilename } from '../bin/server-log.mjs';

describe('serverLogFilename', () => {
  it('names a log localhost followed by the ISO timestamp', () => {
    expect(serverLogFilename(Date.UTC(2026, 10, 23, 15, 4, 5, 123))).toBe('localhost-2026-11-23T15-04-05-123Z.log');
  });
});
