import { describe, expect, it } from 'vitest';
import { DocumentReads } from './document-reads';

describe('DocumentReads', () => {
  it('treats a freshly begun read as current', () => {
    expect(new DocumentReads().begin().isCurrent()).toBe(true);
  });

  it('supersedes an earlier read when a later one begins', () => {
    const reads = new DocumentReads();
    const first = reads.begin();
    const second = reads.begin();
    expect(first.isCurrent()).toBe(false);
    expect(second.isCurrent()).toBe(true);
  });

  it('invalidates the current read on cancel', () => {
    const read = new DocumentReads().begin();
    read.cancel();
    expect(read.isCurrent()).toBe(false);
  });

  it('does not invalidate a newer read when a superseded one cancels', () => {
    const reads = new DocumentReads();
    const first = reads.begin();
    const second = reads.begin();
    first.cancel();
    expect(second.isCurrent()).toBe(true);
  });
});
