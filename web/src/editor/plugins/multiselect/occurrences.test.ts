import { describe, expect, it } from 'vitest';
import { nextOccurrence } from './occurrences';

const DOCUMENT = 'foo Foo foobar\nfoo';

describe('nextOccurrence', () => {
  it('matches exactly and case-sensitively', () => {
    expect(nextOccurrence(DOCUMENT, 'foo', 0, [])).toBe(0);
    expect(nextOccurrence(DOCUMENT, 'Foo', 0, [])).toBe(4);
    expect(nextOccurrence(DOCUMENT, 'FOO', 0, [])).toBeNull();
  });

  it('matches a substring inside a longer word', () => {
    expect(nextOccurrence(DOCUMENT, 'foo', 4, [])).toBe(8);
  });

  it('wraps past the end of the document', () => {
    expect(nextOccurrence(DOCUMENT, 'foo', 16, [])).toBe(0);
  });

  it('skips a match any existing selection already covers', () => {
    const taken = [{ start: 0, end: 3 }, { start: 8, end: 11 }];
    expect(nextOccurrence(DOCUMENT, 'foo', 3, taken)).toBe(15);
  });

  it('skips a match that merely overlaps a taken range', () => {
    // 'aa' at offset 1 overlaps the selection at 0..2, so the next answer is the one at 3.
    expect(nextOccurrence('aaa aa', 'aa', 0, [{ start: 0, end: 2 }])).toBe(4);
  });

  it('answers null once every occurrence is taken', () => {
    const taken = [{ start: 0, end: 3 }, { start: 8, end: 11 }, { start: 15, end: 18 }];
    expect(nextOccurrence(DOCUMENT, 'foo', 3, taken)).toBeNull();
  });

  it('matches a term that spans lines', () => {
    const document = 'a\nb x\na\nb';
    expect(nextOccurrence(document, 'a\nb', 1, [])).toBe(6);
  });

  it('answers null for an empty term and for a term that is not there', () => {
    expect(nextOccurrence(DOCUMENT, '', 0, [])).toBeNull();
    expect(nextOccurrence(DOCUMENT, 'zzz', 0, [])).toBeNull();
  });
});
