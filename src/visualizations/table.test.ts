import { distinctValuesOf, MAX_LISTED_VALUES } from './table.js';
import type { Cell, Table } from './table.js';
import { describe, expect, it } from 'vitest';
import {
  chartable, MAX_COLUMNS, MAX_ROWS, parseDelimitedText, parseJsonText, type TableResult,
} from './table.js';

function tableOf(result: TableResult) {
  if ('error' in result) throw new Error(result.error);
  return result;
}

function typesOf(result: TableResult): Record<string, string> {
  return Object.fromEntries(tableOf(result).table.columns.map((c) => [c.name, c.type]));
}

describe('distinctValuesOf lists what a column holds', () => {
  const table = (columns: { name: string; type: 'number' | 'string' | 'date' | 'boolean' }[], rows: Cell[][]) => ({ columns, rows }) as Table;

  it('lists the values a text column holds, in the order they are first seen', () => {
    const source = table([{ name: 'region', type: 'string' }], [['north'], ['south'], ['north']]);
    expect(distinctValuesOf(source, 'region')).toEqual({ values: ['north', 'south'], more: 0 });
  });

  // An empty cell is a value of its own — "which regions have no data" is a question — and is said as
  // such rather than as a blank that looks like a formatting accident.
  it('says an empty cell as a value', () => {
    const source = table([{ name: 'region', type: 'string' }], [['north'], [null]]);
    expect(distinctValuesOf(source, 'region').values).toEqual(['north', '(empty)']);
  });

  // A measure is read off a chart, and a column of a hundred thousand numbers is not a vocabulary.
  it('lists nothing for a numeric column', () => {
    const source = table([{ name: 'revenue', type: 'number' }], [[1], [2], [3]]);
    expect(distinctValuesOf(source, 'revenue')).toEqual({ values: [], more: 0 });
  });

  // A list that stops without saying so reads as the whole column, and a filter on a value that was never
  // shown is a filter the model had no way to pick.
  it('says when it stopped early', () => {
    const many = Array.from({ length: 30 }, (_, index) => [`v${index}`]);
    const source = table([{ name: 'region', type: 'string' }], many);
    const found = distinctValuesOf(source, 'region');
    expect(found.values).toHaveLength(MAX_LISTED_VALUES);
    expect(found.more).toBe(1);
  });

  it('says nothing for a column it does not have', () => {
    expect(distinctValuesOf(table([{ name: 'a', type: 'string' }], [['x']]), 'b')).toEqual({ values: [], more: 0 });
  });
});

describe('parseJsonText', () => {
  it('reads an array of flat objects and infers each column type', () => {
    const result = parseJsonText('[{"day":"mon","hits":10},{"day":"tue","hits":4}]');
    expect(typesOf(result)).toEqual({ day: 'string', hits: 'number' });
    expect(tableOf(result).table.rows).toEqual([['mon', 10], ['tue', 4]]);
  });

  it('reads an object whose single array property holds the records, directly or one level down', () => {
    expect(tableOf(parseJsonText('{"result":[{"rows":[]}]}')).total).toBe(1);
    expect(tableOf(parseJsonText('{"data":{"items":[{"a":1}]}}')).table.rows).toEqual([[1]]);
  });

  it('refuses an object whose array is more than one level down', () => {
    expect(parseJsonText('{"a":{"b":{"c":[{"n":1}]}}}')).toHaveProperty('error');
  });

  it('reports the true total and the truncation when it caps the rows', () => {
    const rows = Array.from({ length: MAX_ROWS + 25 }, (_, index) => ({ n: index }));
    const result = tableOf(parseJsonText(JSON.stringify(rows)));
    expect(result.table.rows).toHaveLength(MAX_ROWS);
    expect(result.total).toBe(MAX_ROWS + 25);
    expect(result.truncated).toBe(true);
  });

  it('does not claim truncation when the records fit', () => {
    expect(tableOf(parseJsonText('[{"a":1}]')).truncated).toBe(false);
  });

  it('caps the columns, keeping first-seen order', () => {
    const record: Record<string, number> = {};
    for (let index = 0; index < MAX_COLUMNS + 5; index += 1) record[`c${index}`] = index;
    const result = tableOf(parseJsonText(JSON.stringify([record])));
    expect(result.table.columns).toHaveLength(MAX_COLUMNS);
    expect(result.table.columns[0]?.name).toBe('c0');
    expect(result.truncated).toBe(true);
  });

  it('refuses malformed json, a scalar, and an array of scalars', () => {
    expect(parseJsonText('{oops')).toHaveProperty('error');
    expect(parseJsonText('42')).toEqual({ error: 'expected an array of objects, or an object holding one' });
    expect(parseJsonText('[1,2,3]')).toEqual({ error: 'the source holds no records' });
  });

  it('refuses an object with no array property, and one with two', () => {
    expect(parseJsonText('{"a":1}')).toHaveProperty('error');
    expect(parseJsonText('{"a":[{"n":1}],"b":[{"n":2}]}')).toHaveProperty('error');
  });
});

describe('parseDelimitedText', () => {
  it('reads a header-led csv, tsv, semicolon, and pipe file', () => {
    expect(typesOf(parseDelimitedText('a,b\n1,2'))).toEqual({ a: 'number', b: 'number' });
    expect(typesOf(parseDelimitedText('a\tb\n1\t2'))).toEqual({ a: 'number', b: 'number' });
    expect(typesOf(parseDelimitedText('a;b\n1;2'))).toEqual({ a: 'number', b: 'number' });
    expect(typesOf(parseDelimitedText('a|b\n1|2'))).toEqual({ a: 'number', b: 'number' });
  });

  it('keeps a quoted field that holds the delimiter', () => {
    const result = tableOf(parseDelimitedText('name,note\n"ada, countess","said ""hi"""'));
    expect(result.table.rows[0]).toEqual(['ada, countess', 'said "hi"']);
  });

  it('turns a missing value into a null and a number into a number', () => {
    expect(tableOf(parseDelimitedText('a,b\n1,')).table.rows[0]).toEqual([1, null]);
  });

  it('pads a short row rather than dropping its values', () => {
    expect(tableOf(parseDelimitedText('a,b,c\n1,2')).table.rows[0]).toEqual([1, 2, null]);
  });

  it('refuses an empty document and an unclosed quote, and reads a one-column document', () => {
    expect(parseDelimitedText(' '.repeat(3))).toEqual({ error: 'the source is empty' });
    expect(parseDelimitedText('a,b\n"1,2')).toEqual({ error: 'a row has an unclosed quoted field' });
    // A one-column document has no delimiter to sniff, which is not a reason to refuse it: the header
    // is its only column, and `chartable` is what decides whether that is enough to draw.
    expect(tableOf(parseDelimitedText('n\n1\n2')).table.columns.map((c) => c.name)).toEqual(['n']);
  });

  it('reports the true total and the truncation when it caps the rows', () => {
    const lines = ['n,m', ...Array.from({ length: MAX_ROWS + 5 }, (_, index) => `${index},${index}`)];
    const result = tableOf(parseDelimitedText(lines.join('\n')));
    expect(result.table.rows).toHaveLength(MAX_ROWS);
    expect(result.total).toBe(MAX_ROWS + 5);
    expect(result.truncated).toBe(true);
  });
});

describe('column type inference', () => {
  it('reads a column of numbers, of booleans, of mixed values, and of empties', () => {
    expect(typesOf(parseJsonText('[{"a":"1","b":2,"c":"x","d":""}]')))
      .toEqual({ a: 'number', b: 'number', c: 'string', d: 'string' });
    expect(typesOf(parseJsonText('[{"b":"true"},{"b":false}]'))).toEqual({ b: 'boolean' });
    expect(typesOf(parseJsonText('[{"c":"1"},{"c":"x"}]'))).toEqual({ c: 'string' });
  });

  // A date column stays a string on purpose. Claiming a date type would mean deciding a format and a
  // timezone, and a wrong answer there is worse than a category axis.
  it('reads a column of ISO 8601 dates as a date, which is what orders a time axis', () => {
    expect(typesOf(parseJsonText('[{"d":"2026-01-31"}]'))).toEqual({ d: 'date' });
    expect(typesOf(parseJsonText('[{"d":"2026-01-31T09:00:00Z"}]'))).toEqual({ d: 'date' });
    expect(typesOf(parseJsonText('[{"d":"2026-01-31 09:00"}]'))).toEqual({ d: 'date' });
  });

  // `Date.parse` checks no calendar, so a pattern alone would type a column of typos as a date and then
  // plot the rollovers. These are the cases that makes real.
  it('leaves a date the calendar disagrees with a string', () => {
    expect(typesOf(parseJsonText('[{"d":"2026-02-31"}]'))).toEqual({ d: 'string' });
    expect(typesOf(parseJsonText('[{"d":"2026-13-01"}]'))).toEqual({ d: 'string' });
    expect(typesOf(parseJsonText('[{"d":"2026-01-31T24:00:00Z"}]'))).toEqual({ d: 'string' });
    expect(typesOf(parseJsonText('[{"d":"2026-01-31T09:60:00Z"}]'))).toEqual({ d: 'string' });
  });

  it('knows which years have a 29th of February', () => {
    expect(typesOf(parseJsonText('[{"d":"2024-02-29"}]'))).toEqual({ d: 'date' });
    expect(typesOf(parseJsonText('[{"d":"2023-02-29"}]'))).toEqual({ d: 'string' });
  });

  // Both of these are readable by `Date.parse` and both ambiguous to a person, so neither is a date
  // here — a column in either format stays a category, which is what it was before this type existed.
  it('leaves an unambiguous-looking but ambiguous format a string', () => {
    expect(typesOf(parseJsonText('[{"d":"2026-1-31"}]'))).toEqual({ d: 'string' });
    expect(typesOf(parseJsonText('[{"d":"01/31/2026"}]'))).toEqual({ d: 'string' });
  });

  it('needs every value present to be a date before the column is one', () => {
    expect(typesOf(parseJsonText('[{"d":"2026-01-31"},{"d":null}]'))).toEqual({ d: 'date' });
    expect(typesOf(parseJsonText('[{"d":"2026-01-31"},{"d":"sometime"}]'))).toEqual({ d: 'string' });
  });

  // A date is a category, not a measure, so a source holding nothing but dates still cannot be charted
  // against anything. The new type must not open that door by being mistaken for a number.
  it('reads a date column as nothing but a date, never as a measure', () => {
    expect(chartable(tableOf(parseJsonText('[{"d":"2026-01-31"}]')).table))
      .toEqual({ error: 'the source has no numeric column to measure' });
  });

  it('de-duplicates a repeated header name and names an empty one', () => {
    const result = tableOf(parseDelimitedText('a,a,\n1,2,3'));
    expect(result.table.columns.map((c) => c.name)).toEqual(['a', 'column']);
  });
});

describe('chartable', () => {
  it('refuses a table with no rows, and one with no numeric column', () => {
    expect(chartable({ columns: [{ name: 'a', type: 'number' }], rows: [] }))
      .toEqual({ error: 'the source has no rows' });
    expect(chartable({ columns: [{ name: 'a', type: 'string' }], rows: [['x']] }))
      .toEqual({ error: 'the source has no numeric column to measure' });
  });

  it('accepts a table with a measure', () => {
    expect(chartable(tableOf(parseJsonText('[{"a":1}]')).table)).toEqual({ ok: true });
  });
});
