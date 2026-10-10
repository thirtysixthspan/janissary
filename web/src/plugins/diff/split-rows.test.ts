import { describe, it, expect } from 'vitest';
import { splitRows } from './split-rows';
import type { DiffLine } from '@shared/plugins/diff/shared';

const line = (kind: DiffLine['kind'], number: number): DiffLine => ({ kind, number, jump: number, text: `${kind} ${number}` });

describe('splitRows', () => {
  it('shows a context line on both sides of one row', () => {
    const rows = splitRows({ lines: [line('context', 1), line('context', 2)] });
    expect(rows).toEqual([
      { old: line('context', 1), next: line('context', 1) },
      { old: line('context', 2), next: line('context', 2) },
    ]);
  });

  it('pairs a run of removed lines with the added run that follows it', () => {
    const rows = splitRows({
      lines: [line('context', 1), line('removed', 2), line('removed', 3), line('added', 2), line('added', 3)],
    });
    expect(rows).toEqual([
      { old: line('context', 1), next: line('context', 1) },
      { old: line('removed', 2), next: line('added', 2) },
      { old: line('removed', 3), next: line('added', 3) },
    ]);
  });

  it('leaves a side empty when the runs differ in length', () => {
    const rows = splitRows({ lines: [line('added', 1), line('added', 2)] });
    expect(rows).toEqual([
      { old: undefined, next: line('added', 1) },
      { old: undefined, next: line('added', 2) },
    ]);
    const deletions = splitRows({ lines: [line('removed', 1), line('removed', 2)] });
    expect(deletions).toEqual([
      { old: line('removed', 1), next: undefined },
      { old: line('removed', 2), next: undefined },
    ]);
  });

  it('keeps two separate replace runs on their own rows', () => {
    const rows = splitRows({
      lines: [line('removed', 1), line('added', 1), line('context', 2), line('removed', 2), line('added', 2)],
    });
    expect(rows.map((row) => [row.old?.kind, row.next?.kind])).toEqual([
      ['removed', 'added'], ['context', 'context'], ['removed', 'added'],
    ]);
  });
});
