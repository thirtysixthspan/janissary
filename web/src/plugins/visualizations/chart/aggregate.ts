// Reducing a group of rows to one number, and grouping the rows that share a category. Pure throughout:
// this is the arithmetic behind an aggregate, and a wrong reduction here is a confidently wrong chart,
// so it is testable without going through the mark builder that calls it.

// How `y` is reduced within a category before the marks are built. `count` measures the rows rather than
// the values, and still obeys the rule that a row whose measure is not a number is not plotted — and so
// is not counted either, which is the one rule all of them share.
export type Aggregate =
  | 'sum' | 'mean' | 'median' | 'percentile' | 'variance'
  | 'count' | 'distinct' | 'min' | 'max';

export type ReduceInput = { label: string; series: string; value: number };

export type Group = { label: string; series: string; values: number[] };

// The two halves of a key are joined by a NUL, which no CSV field and no JSON string holds unescaped, so
// a category that happens to contain the separator cannot forge a group that was never there. It is
// written as an escape rather than a literal byte, because a NUL in a source file is invisible in review
// and in a diff.
const KEY_SEPARATOR = '\u{0}';

// The rows sharing one category — and, where the chart is split, one series within it. Order is
// first-seen, so the bands come out in the order the source listed its categories.
export function groupsFor(marks: readonly ReduceInput[], split: boolean, single: string): Group[] {
  const byKey = new Map<string, Group>();
  for (const mark of marks) {
    const key = split ? `${mark.label}${KEY_SEPARATOR}${mark.series}` : mark.label;
    const found = byKey.get(key);
    if (found) found.values.push(mark.value);
    else {
      byKey.set(key, {
        label: mark.label,
        series: split ? mark.series : single,
        values: [mark.value],
      });
    }
  }
  return [...byKey.values()];
}

// The one reduction, written as a switch rather than a chain of comparisons so that an aggregate this
// module has never heard of is impossible to fall through: the old chain returned the `min` accumulator
// for anything it did not recognise, which drew '-Infinity' as a bar rather than failing.
export function reduce(aggregate: Aggregate, values: readonly number[], percentile = 50): number {
  switch (aggregate) {
    // An empty group has no value to reduce, and a chart over a source that produced none should draw
    // nothing for that category rather than a zero it never measured. Zero is the one answer a reader
    // would read as a measurement.
    case 'sum': {
      return total(values);
    }
    case 'mean': {
      return mean(values);
    }
    case 'median': {
      return median(values);
    }
    case 'percentile': {
      return percentileOf(values, percentile);
    }
    case 'variance': {
      return variance(values);
    }
    case 'count':
    case 'distinct': {
      // A group is already one series within one category, so a distinct count is over the group as it
      // stands rather than over the whole table.
      return aggregate === 'count' ? values.length : new Set(values).size;
    }
    case 'min': {
      return extreme(values, 'min');
    }
    case 'max': {
      return extreme(values, 'max');
    }
    default: {
      return NaN;
    }
  }
}

function total(values: readonly number[]): number {
  let sum = 0;
  for (const value of values) sum += value;
  return sum;
}

function mean(values: readonly number[]): number {
  return values.length === 0 ? NaN : total(values) / values.length;
}

// The middle of the sorted group: the middle value for an odd count, and the mean of the two middle
// values for an even one, which is the convention a person means by "the median of four numbers".
function median(values: readonly number[]): number {
  if (values.length === 0) return NaN;
  const sorted = values.toSorted((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? NaN;
  return (((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2);
}

// The percentile by linear interpolation between the two nearest ranks — the same definition
// NumPy, R's default and Observable Plot's `pXX` reducer all use, so a number read off a chart
// here is the number a colleague gets in a notebook. A rank that falls between two values is
// interpolated rather than rounded, which is why 95th of ten values is not simply the largest of them.
export function percentileOf(values: readonly number[], percentile: number): number {
  if (values.length === 0) return NaN;
  const sorted = values.toSorted((a, b) => a - b);
  const rank = (Math.min(100, Math.max(0, percentile)) / 100) * (sorted.length - 1);
  const below = Math.floor(rank);
  const above = Math.ceil(rank);
  if (below === above) return sorted[below] ?? NaN;
  const low = sorted[below] ?? NaN;
  const high = sorted[above] ?? NaN;
  return low + (high - low) * (rank - below);
}

// The sample variance, over n-1, because the series being summarised is a sample of something and
// dividing by n would understate how spread it is. A single value has no spread to report, and two
// squared deviations divided by one is not a number anyone should read off a chart.
function variance(values: readonly number[]): number {
  if (values.length < 2) return NaN;
  const average = mean(values);
  let squares = 0;
  for (const value of values) squares += (value - average) ** 2;
  return squares / (values.length - 1);
}

function extreme(values: readonly number[], which: 'min' | 'max'): number {
  if (values.length === 0) return NaN;
  let best = values[0] ?? NaN;
  for (const value of values) {
    if (which === 'min' ? value < best : value > best) best = value;
  }
  return best;
}
