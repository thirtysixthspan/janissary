import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initDbDir } from '../connections.js';
import { CONSOLE_ROW_LIMIT, readStatement, REPORT_LINE_BUDGET } from './console-read.js';
import { openResultFile, RESULT_ROW_LIMIT, type ResultWriter } from './export.js';

let project: string;
let database: DatabaseSync;

beforeEach(() => {
  project = mkdtempSync(path.join(tmpdir(), 'janus-console-read-'));
  database = new DatabaseSync(':memory:');
  initDbDir(project);
  database.exec(`
    CREATE TABLE orders (id INTEGER PRIMARY KEY, status TEXT, note TEXT);
    INSERT INTO orders (status, note) VALUES ('paid', NULL), ('due', 'overdue');
  `);
});

afterEach(() => {
  database.close();
  rmSync(project, { recursive: true, force: true });
});

/** The writer a statement's result streams into, with the timestamp pinned. */
function writer() {
  return () => openResultFile('shop', Date.parse('2026-01-02T03:04:05.678Z'));
}

/** A host that has nowhere to put one, so the result can only be shortened. */
const noFiles = (): ResultWriter | undefined => undefined;

function manyRows(count: number): void {
  database.exec(`
    CREATE TABLE many (id INTEGER PRIMARY KEY);
    INSERT INTO many (id) WITH RECURSIVE n(i) AS (
      SELECT 1 UNION ALL SELECT i+1 FROM n WHERE i < ${count}
    ) SELECT i FROM n;
  `);
}

const written = (file: string | undefined) => readFileSync(file as string, 'utf8');

// A notification is a one-line event, so the line says how many rows came back and the result is a
// file the line links to — the arrangement an auto-approved permission prompt's screen capture uses.
describe("a statement's report", () => {
  it('says how many rows came back in one line, and files the result', () => {
    const { report } = readStatement(database, 'SELECT id, status FROM orders', writer());
    expect(report.text).toBe('Query returned 2 rows.');
    expect(report.file).toMatch(/shop-result-2026-01-02T03-04-05-678Z\.txt$/u);
    expect(written(report.file)).toBe('id\tstatus\n1\tpaid\n2\tdue\n(2 rows)\n');
  });

  it('says one row as one row', () => {
    const { report } = readStatement(database, 'SELECT id FROM orders WHERE id = 1', writer());
    expect(report.text).toBe('Query returned 1 row.');
    expect(written(report.file)).toBe('id\n1\n(1 row)\n');
  });

  it('files a null as the empty string the grid shows, rather than as the word NULL', () => {
    const { report } = readStatement(database, 'SELECT note FROM orders WHERE id = 1', writer());
    expect(written(report.file)).toBe('note\n\n(1 row)\n');
  });

  // An empty result is still an answer, and its header says what the statement would have returned.
  it('says so on a statement that returned nothing, and still files its header', () => {
    const { report } = readStatement(database, 'SELECT id FROM orders WHERE id = 99', writer());
    expect(report.text).toBe('Query returned no rows.');
    expect(written(report.file)).toBe('id\n(no rows)\n');
  });

  it('files every row of a long result, and still says it in one line', () => {
    const rows = REPORT_LINE_BUDGET * 2;
    manyRows(rows);
    const { report } = readStatement(database, 'SELECT id FROM many', writer());
    expect(report.text).toBe(`Query returned ${rows} rows.`);
    const every = Array.from({ length: rows }, (_, i) => String(i + 1));
    expect(written(report.file)).toBe(`id\n${every.join('\n')}\n(${rows} rows)\n`);
  });

  it('keeps the grid to its own ceiling, whatever the file holds', () => {
    manyRows(CONSOLE_ROW_LIMIT + 5);
    const { grid, report } = readStatement(database, 'SELECT id FROM many', writer());
    expect(grid.rows).toHaveLength(CONSOLE_ROW_LIMIT);
    expect(grid.truncated).toBe(true);
    expect(report.text).toBe(`Query returned ${CONSOLE_ROW_LIMIT + 5} rows.`);
  });

  // A result of a million rows is a query to narrow, not a file to write — and the line has to say
  // which of the two it is, or a capped file reads as a complete one.
  it('says so when the result is too long to write out in full', () => {
    manyRows(RESULT_ROW_LIMIT + 5);
    const { report, grid } = readStatement(database, 'SELECT id FROM many', writer());
    expect(report.text).toBe('Query returned more than 1,000,000 rows; the first 1,000,000 are in the file.');
    expect(written(report.file)).toContain(`capped at ${RESULT_ROW_LIMIT.toLocaleString('en-US')}`);
    expect(grid.truncated).toBe(true);
  }, 60_000);

  // A host with nowhere to put a file still reports the result, and a statement that ran perfectly
  // well is not a statement that failed.
  it('says the result itself, shortened, when there is nowhere to put a file', () => {
    manyRows(REPORT_LINE_BUDGET * 2);
    const { report } = readStatement(database, 'SELECT id FROM many', noFiles);
    expect(report.file).toBeUndefined();
    expect(report.text).toContain(`first ${REPORT_LINE_BUDGET} shown`);
    expect(report.text.split('\n')).toHaveLength(REPORT_LINE_BUDGET + 2);

    const short = readStatement(database, 'SELECT id, status FROM orders', noFiles).report;
    expect(short.text).toBe('id\tstatus\n1\tpaid\n2\tdue\n(2 rows)');
  });

  // The file is opened before the walk, so a statement that fails part-way must not leave it open.
  it('closes the file when the walk fails part-way through its rows', () => {
    const end = vi.fn();
    let writes = 0;
    const failing = () => ({
      path: '/tmp/result.txt',
      write: () => { writes += 1; if (writes > 1) throw new Error('disk full'); },
      end,
    });
    expect(() => readStatement(database, 'SELECT id FROM orders', failing)).toThrow('disk full');
    expect(end).toHaveBeenCalledExactlyOnceWith('');
  });

  // The statement runs once: the grid and the report are two answers from one walk, and a statement
  // that changes rows would otherwise be applied twice.
  it('prepares the statement once for both answers', () => {
    database.exec(`
      CREATE TABLE counted (n INTEGER);
      INSERT INTO counted (n) VALUES (0);
    `);
    const before = database.prepare('SELECT n FROM counted').all();
    const { grid, report } = readStatement(database, 'SELECT n FROM counted', writer());
    expect(grid.rows).toHaveLength(1);
    expect(report.text).toBe('Query returned 1 row.');
    expect(database.prepare('SELECT n FROM counted').all()).toEqual(before);
  });
});
