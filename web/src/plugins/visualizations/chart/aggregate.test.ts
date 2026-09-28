import { describe, expect, it } from 'vitest';
import { groupsFor, percentileOf, reduce } from './aggregate';

// The sample variance, written out here rather than reached through `reduce`, because a variance is the
// one aggregate that cannot be shown to be right by a two-value group and needs the worked example.
function variance(values: number[]): number {
  return reduce('variance', values);
}

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

  // The middle of a group is not its average, and the difference is the whole reason these arrived: a
  // mean over a long-tailed measure is dragged by the tail into a number that describes no row at all,
  // so a chart of "how long is a request" drawn with a mean is quietly wrong rather than merely coarse.
  it('takes the median, and the mean of the two middles for an even count', () => {
    expect(reduce('median', [10, 4, 6])).toBe(6);
    expect(reduce('median', [10, 4, 6, 8])).toBe(7);
    expect(reduce('median', [7])).toBe(7);
  });

  // Linear interpolation between the two nearest ranks, which is what NumPy, R and Plot's pXX all do,
  // so a number read off a chart here is the number a colleague gets in a notebook. Taking the nearest
  // rank instead would put the 95th percentile of ten values at the ninth, which is a different number.
  it('interpolates a percentile rather than taking the nearest rank', () => {
    expect(percentileOf([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 50)).toBe(5.5);
    expect(percentileOf([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 95)).toBeCloseTo(9.55, 10);
    expect(percentileOf([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0)).toBe(1);
    expect(percentileOf([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 100)).toBe(10);
  });

  it('reads a percentile as the one it was given, and defaults to the middle', () => {
    const long = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(reduce('percentile', long, 95)).toBeCloseTo(9.55, 10);
    expect(reduce('percentile', long)).toBe(5.5);
  });

  it('reports the spread over n-1, because the series is a sample of something', () => {
    expect(variance([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(4.571428, 5);
    expect(variance([1, 2, 3])).toBe(1);
  });

  it('counts the values a group holds rather than the rows it has', () => {
    expect(reduce('distinct', [10, 10, 10])).toBe(1);
    expect(reduce('distinct', [10, 4, 6])).toBe(3);
  });

  // An empty group has no value to reduce, so an average of it is not zero: a zero would be a bar of a
  // height nobody measured. The three that answer a question about how many rather than how much are
  // right to say zero, and the distinction is the point rather than a detail.
  it('reduces an empty group to nothing, except where zero is the answer', () => {
    for (const aggregate of ['mean', 'median', 'percentile', 'variance', 'min', 'max'] as const) {
      expect(reduce(aggregate, [])).toBeNaN();
    }
    for (const aggregate of ['sum', 'count', 'distinct'] as const) {
      expect(reduce(aggregate, [])).toBe(0);
    }
  });

  // A group of one has no spread to report: the sample variance over n-1 would divide by zero.
  it('has no variance for a single value', () => {
    expect(variance([7])).toBeNaN();
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
