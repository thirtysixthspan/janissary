import { describe, expect, it } from 'vitest';
import { groupsFor, reduce } from './aggregate';

// A wrong reduction here is a confidently wrong chart: the marks draw, the axis carries the right
// column names, and the number beside each bar is simply the wrong one. So every aggregate is pinned
// against a group it cannot be confused with.

const MARKS = [
  { label: 'north', series: '', value: 10 },
  { label: 'south', series: '', value: 4 },
  { label: 'north', series: '', value: 6 },
];

function values(aggregate: Parameters<typeof reduce>[0]): number[] {
  return groupsFor(MARKS, false, '').map((group) => reduce(aggregate, group.values));
}

describe('reduce', () => {
  it('sums, averages, counts, and takes the extremes of the same group', () => {
    expect(values('sum')).toEqual([16, 4]);
    expect(values('mean')).toEqual([8, 4]);
    expect(values('count')).toEqual([2, 1]);
    expect(values('min')).toEqual([6, 4]);
    expect(values('max')).toEqual([10, 4]);
  });

  it('averages a single value to itself rather than to itself over zero', () => {
    expect(reduce('mean', [7])).toBe(7);
    expect(reduce('min', [7])).toBe(7);
    expect(reduce('max', [7])).toBe(7);
  });

  it('keeps a negative span intact, which a scale that assumes positivity would lose', () => {
    expect(reduce('sum', [-4, -1])).toBe(-5);
    expect(reduce('mean', [-4, -1])).toBe(-2.5);
    expect(reduce('min', [-4, -1])).toBe(-4);
    expect(reduce('max', [-4, -1])).toBe(-1);
  });
});

describe('groupsFor', () => {
  it('keeps first-seen order, so the bands come out in the order the source listed them', () => {
    expect(groupsFor(MARKS, false, '').map((group) => group.label)).toEqual(['north', 'south']);
  });

  it('splits by series only when asked, and names the single series nothing', () => {
    const split = groupsFor([
      { label: 'a', series: 'one', value: 1 },
      { label: 'a', series: 'two', value: 2 },
      { label: 'b', series: 'one', value: 3 },
    ], true, '');
    expect(split.map((group) => `${group.label}/${group.series}`))
      .toEqual(['a/one', 'a/two', 'b/one']);
    expect(split.map((group) => group.values)).toEqual([[1], [2], [3]]);
    expect(groupsFor(MARKS, false, 'only').every((group) => group.series === 'only')).toBe(true);
  });

  // Two keys that concatenate to the same text are not the same group, and a separator chosen badly
  // would merge them and produce a number that belongs to neither.
  it('keeps a category containing the separator apart from the pair it imitates', () => {
    const forged = [
      { label: 'a', series: 'b', value: 1 },
      { label: `a${String.fromCodePoint(0)}`, series: 'b', value: 2 },
    ];
    expect(groupsFor(forged, true, '')).toHaveLength(2);
  });
});
