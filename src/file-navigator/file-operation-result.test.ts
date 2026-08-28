import { describe, expect, it } from 'vitest';
import { fileOperationReason } from './file-operation-result.js';

describe('fileOperationReason', () => {
  it.each([
    ['EACCES', 'Permission denied; check file and folder permissions, then try again'],
    ['ENOSPC', 'The disk is full; free some space, then try again'],
    ['EXDEV', 'The source and destination are on different filesystems; copy the item instead'],
    ['ENOENT', 'The source or destination no longer exists; refresh the file navigator, then try again'],
    ['EROFS', 'The destination is read-only; choose a writable location'],
  ])('maps %s to an actionable reason', (code, expected) => {
    expect(fileOperationReason({ code })).toBe(expected);
  });

  it('keeps an unknown code without exposing the raw error message or paths', () => {
    expect(fileOperationReason({ code: 'EUNKNOWN', message: '/secret/source -> /secret/destination' }))
      .toBe('Filesystem error EUNKNOWN; check the item and destination, then try again');
  });

  it('uses a safe fallback for a non-Node error', () => {
    expect(fileOperationReason(new Error('/secret/source')))
      .toBe('Filesystem error; check the item and destination, then try again');
  });
});
