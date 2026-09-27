import { describe, expect, it } from 'vitest';
import { bandsOf, isDefault, viewMarks, viewedMarksFor, DEFAULT_VIEW, type ChartView } from './view';
import { marksFor, type ChartShape, type Marks, type Table } from './points';

// A view is a way of looking at marks, so every one of these is a pure question about a list: does it
// come back the same, does it keep whole bands, and is it the same on the next run.

const TABLE: Table = {
  columns: [
    { name: 'region', type: 'string' },
    { name: 'revenue', type: 'number' },
  ],
  rows: [
    ['north', 10],
    ['south', 4],
    ['east', 7],
  ],
};

const SPLIT: Table = {
  columns: [
    { name: 'region', type: 'string' },
    { name: 'revenue', type: 'number' },
    { name: 'year', type: 'number' },
  ],
  rows: [
    ['north', 10, 2024],
    ['south', 4, 2024],
    ['north', 3, 2025],
  ],
};

function chart(over: Partial<ChartShape> = {}): ChartShape {
  return { kind: 'bar', x: 'region', y: 'revenue', title: 'Revenue', ...over };
}

function view(over: Partial<ChartView> = {}): ChartView {
  return { ...DEFAULT_VIEW, ...over };
}

function labels(marks: Marks): (string | number)[][] {
  return marks.points.map((point) => [point.band, point.label, point.value]);
}

describe('isDefault', () => {
  it('knows the chart as it was specified from one that has been narrowed', () => {
    expect(isDefault(DEFAULT_VIEW)).toBe(true);
    expect(isDefault(view({ sort: 'value' }))).toBe(false);
    expect(isDefault(view({ limit: 5 }))).toBe(false);
    expect(isDefault(view({ focus: 'north' }))).toBe(false);
  });
});

describe('viewMarks', () => {
  // The regression this whole module could have caused: a chart nobody touches must be the chart that
  // shipped, so the default view returns its input rather than a re-derivation of it.
  it('returns the marks untouched for the default view', () => {
    const marks = marksFor(TABLE, chart());
    expect(viewMarks(marks, DEFAULT_VIEW)).toBe(marks);
  });

  it('orders by source, by category, and by value', () => {
    const marks = marksFor(TABLE, chart());
    expect(labels(viewMarks(marks, view({ sort: 'source' }))))
      .toEqual([[0, 'north', 10], [1, 'south', 4], [2, 'east', 7]]);
    expect(labels(viewMarks(marks, view({ sort: 'category' }))))
      .toEqual([[0, 'east', 7], [1, 'north', 10], [2, 'south', 4]]);
    expect(labels(viewMarks(marks, view({ sort: 'value' }))))
      .toEqual([[0, 'north', 10], [1, 'east', 7], [2, 'south', 4]]);
  });

  // "Top 5" has to mean five categories. Counting marks would drop one of a split band's series and
  // leave its neighbour a different height with nothing to explain the difference.
  it('caps in bands, so a split chart loses a whole band rather than one of its series', () => {
    const marks = marksFor(SPLIT, chart({ series: 'year', aggregate: 'sum' }));
    // The band is kept whole: both of north's series survive, and south's is dropped with the band.
    expect(labels(viewMarks(marks, view({ sort: 'value', limit: 1 }))))
      .toEqual([[0, 'north', 10], [1, 'north', 3]]);
  });

  it('keeps the first N bands in the order the marks are drawn', () => {
    const marks = marksFor(TABLE, chart());
    expect(labels(viewMarks(marks, view({ sort: 'value', limit: 2 }))))
      .toEqual([[0, 'north', 10], [1, 'east', 7]]);
  });

  it('renumbers densely after a cap, so the axis has no hole in it', () => {
    const marks = marksFor(TABLE, chart());
    expect(viewMarks(marks, view({ sort: 'value', limit: 2 })).points.map((point) => point.band))
      .toEqual([0, 1]);
  });

  it('keeps one category and drops the rest when filtering', () => {
    const marks = marksFor(TABLE, chart());
    expect(labels(viewMarks(marks, view({ focus: 'east' })))).toEqual([[0, 'east', 7]]);
  });

  it('caps after filtering, not before it', () => {
    const marks = marksFor(TABLE, chart());
    expect(labels(viewMarks(marks, view({ focus: 'east', sort: 'value', limit: 5 }))))
      .toEqual([[0, 'east', 7]]);
  });

  // Two marks of equal value are two marks the source listed in an order, and an unstable sort would be
  // free to redraw the chart differently on the next run.
  it('keeps source order between two equal values', () => {
    const tied: Table = {
      columns: [{ name: 'a', type: 'string' }, { name: 'b', type: 'number' }],
      rows: [['x', 5], ['y', 5], ['z', 5]],
    };
    const marks = marksFor(tied, chart({ x: 'a', y: 'b' }));
    expect(labels(viewMarks(marks, view({ sort: 'value' }))))
      .toEqual([[0, 'x', 5], [1, 'y', 5], [2, 'z', 5]]);
  });

  it('changes nothing when the cap is larger than the data, or zero', () => {
    const marks = marksFor(TABLE, chart());
    expect(labels(viewMarks(marks, view({ limit: 0 })))).toEqual(labels(marks));
    expect(labels(viewMarks(marks, view({ limit: 99 })))).toEqual(labels(marks));
  });

  it('leaves the marks alone when a filter names a category that is not there', () => {
    const marks = marksFor(TABLE, chart());
    expect(viewMarks(marks, view({ focus: 'nowhere' })).points).toEqual([]);
  });

  it('falls back to source order for an order it does not know', () => {
    const marks = marksFor(TABLE, chart());
    const rogue = { sort: 'sideways', limit: 0 } as unknown as ChartView;
    expect(labels(viewMarks(marks, rogue))).toEqual(labels(marks));
  });
});

describe('bandsOf', () => {
  it('lists each category once, in the order the marks are drawn', () => {
    const marks = marksFor(SPLIT, chart({ series: 'year' }));
    expect(bandsOf(marks.points)).toEqual(['north', 'south']);
  });
});

describe('viewedMarksFor', () => {
  it('is the one composition, so the picture and the table cannot disagree', () => {
    const narrowed = viewedMarksFor(TABLE, chart(), view({ sort: 'value', limit: 2 }));
    expect(labels(narrowed)).toEqual([[0, 'north', 10], [1, 'east', 7]]);
  });

  it('leaves a pie alone, because a pie has no order to change', () => {
    const pie = viewedMarksFor(TABLE, chart({ kind: 'pie' }), view({ sort: 'value', limit: 1 }));
    expect(pie.slices).toEqual([{ label: 'north', value: 10 }, { label: 'south', value: 4 }, { label: 'east', value: 7 }]);
  });
});
