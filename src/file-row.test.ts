import { describe, expect, it } from 'vitest';
import { formatFileRow } from './file-row.js';

const EPOCH = Date.parse('2026-11-19T13:50:00Z');

describe('formatFileRow', () => {
  it('prints the fixed tokens in order with an ISO UTC mtime', () => {
    expect(formatFileRow('notes.md', { size: 1234, modified: EPOCH, mode: 0o10_0644 }))
      .toBe('file -rw-r--r-- 1234 2026-11-19T13:50:00.000Z notes.md');
  });

  it('uses the dir type word and leading d for a directory mode', () => {
    expect(formatFileRow('src', { size: 4096, modified: EPOCH, mode: 0o4_0755 }))
      .toBe('dir drwxr-xr-x 4096 2026-11-19T13:50:00.000Z src');
  });

  it('renders all three permission triplets including execute bits', () => {
    expect(formatFileRow('run.sh', { size: 7, modified: EPOCH, mode: 0o10_0751 }))
      .toBe('file -rwxr-x--x 7 2026-11-19T13:50:00.000Z run.sh');
  });

  it('renders a zero stat with the fixed row shape', () => {
    expect(formatFileRow('gone', { size: 0, modified: 0, mode: 0 }))
      .toBe('file ---------- 0 1970-01-01T00:00:00.000Z gone');
  });

  it('does not humanize sizes or pad columns', () => {
    expect(formatFileRow('big.bin', { size: 1_500_000, modified: EPOCH, mode: 0o10_0600 }))
      .toBe('file -rw------- 1500000 2026-11-19T13:50:00.000Z big.bin');
  });

  it('renders a symlink mode as a file leaf', () => {
    expect(formatFileRow('link', { size: 3, modified: EPOCH, mode: 0o12_0777 }))
      .toBe('file -rwxrwxrwx 3 2026-11-19T13:50:00.000Z link');
  });
});
