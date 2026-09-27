// Reducing a group of rows to one number, and grouping the rows that share a category. Pure throughout:
// this is the arithmetic behind an aggregate, and a wrong reduction here is a confidently wrong chart,
// so it is testable without going through the mark builder that calls it.

// How `y` is reduced within a category before the marks are built. `count` measures the rows rather than
// the values, and still obeys the rule that a row whose measure is not a number is not plotted — and so
// is not counted either, which is the one rule all five share.
export type Aggregate = 'sum' | 'mean' | 'count' | 'min' | 'max';

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

export function reduce(aggregate: Aggregate, values: readonly number[]): number {
  if (aggregate === 'count') return values.length;
  let extreme = aggregate === 'min' ? Infinity : -Infinity;
  let total = 0;
  for (const value of values) {
    total += value;
    if (aggregate === 'min' && value < extreme) extreme = value;
    if (aggregate === 'max' && value > extreme) extreme = value;
  }
  if (aggregate === 'sum') return total;
  if (aggregate === 'mean') return total / values.length;
  return extreme;
}
