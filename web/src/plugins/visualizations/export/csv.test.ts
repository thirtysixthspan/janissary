import { describe, expect, it } from 'vitest';
import { csvOf, type CsvTable } from './csv';

// A CSV is read by things nobody tests: a spreadsheet, a diff view, a text editor. The three ways it goes
// wrong are a value that ends the row early, a value that ends the field early, and a value that arrives
// as a formula — and the last one is the reason this file quotes a cell beginning with a minus sign.

const HEADER = { title: 'Revenue by region', source: 'https://example.com/sales.csv', notes: ['only 2024'] };

function tableOf(columns: string[], rows: (string | number)[][]): CsvTable {
  return { columns: columns.map((name) => ({ name, numeric: false })), rows };
}

describe('csvOf', () => {
  it('writes a header line, the columns, and one row per mark', () => {
    const csv = csvOf(tableOf(['region', 'revenue'], [['north', 10], ['south', 4]]), HEADER);
    expect(csv).toBe([
      ' # Revenue by region',
      ' # only 2024',
      ' # https://example.com/sales.csv',
      'region,revenue',
      'north,10',
      'south,4',
      '',
    ].join('\n'));
  });

  // A value holding a comma is the common case and the one a naive join turns into three columns.
  it('quotes a value holding a comma, a quote or a line break', () => {
    const csv = csvOf(tableOf(['label'], [['a,b'], ['say "hi"'], ['two\nlines']]), HEADER);
    expect(csv.split('\n').slice(4, -1).filter((line) => line !== '')).toEqual(['"a,b"', '"say ""hi"""', '"two', 'lines"']);
  });

  // Data out of somebody\x27s log beginning with a minus sign is not a formula, and a spreadsheet will not
  // know that.
  it('quotes a value a spreadsheet would read as a formula', () => {
    const rows = tableOf(['v'], [['=1+1'], ['-5'], ['+3'], ['@cmd']]);
    expect(csvOf(rows, HEADER).split('\n').slice(4, -1).filter((line) => line !== '')).toEqual(['"=1+1"', '"-5"', '"+3"', '"@cmd"']);
  });

  it('leaves an ordinary number and an ordinary word alone', () => {
    const csv = csvOf(tableOf(['v'], [[42], ['north']]), HEADER);
    expect(csv.split('\n').slice(4, -1).filter((line) => line !== '')).toEqual(['42', 'north']);
  });

  it('writes nothing for a value that is not a number, rather than the word NaN', () => {
    // A file whose row reads `NaN` is a file claiming a measurement it does not have.
    expect(csvOf(tableOf(['v'], [[NaN]]), HEADER).endsWith('v\n\n')).toBe(true);
  });

  it('quotes a column name, because a column can hold a comma as easily as a value', () => {
    expect(csvOf(tableOf(['a,b'], []), HEADER).split('\n', 4).at(3)).toBe('"a,b"');
  });
});
