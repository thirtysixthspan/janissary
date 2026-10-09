import { describe, it, expect } from 'vitest';
import { fileStatus } from './status';
import type { DiffFile } from '@shared/plugins/diff/shared';

function file(overrides: Partial<DiffFile> = {}): DiffFile {
  return {
    path: 'a.txt', additions: 1, deletions: 1,
    hunks: [{ oldStart: 1, newStart: 1, lines: [{ kind: 'added', number: 1, jump: 1, text: 'here' }] }],
    ...overrides,
  };
}

describe('fileStatus', () => {
  it('answers added for a file the record marks as having no original side', () => {
    expect(fileStatus(file({ added: true })).label).toBe('added');
  });

  it('answers modified for a file that only added lines and was not marked', () => {
    expect(fileStatus(file({ additions: 3, deletions: 0 })).label).toBe('modified');
  });

  it('answers deleted for a record the working tree no longer holds', () => {
    expect(fileStatus(file({ deleted: true })).label).toBe('deleted');
  });

  it('answers renamed for a record that carries both paths', () => {
    expect(fileStatus(file({ oldPath: 'old.txt' })).label).toBe('renamed');
  });

  it('answers binary for a record git reported as binary', () => {
    expect(fileStatus(file({ binary: true, hunks: [] })).label).toBe('binary');
  });

  it('answers mode for a record with no hunks that is not binary', () => {
    expect(fileStatus(file({ additions: 0, deletions: 0, hunks: [] })).label).toBe('mode');
  });

  it('answers binary and deleted over the labels its counts or paths would suggest', () => {
    expect(fileStatus(file({ binary: true, oldPath: 'old.txt' })).kind).toBe('binary');
    expect(fileStatus(file({ deleted: true, oldPath: 'old.txt' })).kind).toBe('removed');
  });
});
