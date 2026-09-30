import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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

/** The writer a statement's long result streams into, with the timestamp pinned. */
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

describe("a statement's report", () => {
  it('says a short result outright, and leaves no file behind', () => {
    const { report } = readStatement(database, 'SELECT id, status FROM orders', writer());
    expect(report.text).toBe('id\tstatus\n1\tpaid\n2\tdue\n(2 rows)');
    expect(report.file).toBeUndefined();
  });

  it('says a null as the empty string the grid shows, rather than as the word NULL', () => {
    const { report } = readStatement(database, 'SELECT note FROM orders WHERE id = 1', writer());
    expect(report.text).toBe('note\n\n(1 row)');
  });

  it('says so on a statement that returned nothing', () => {
    const { report } = readStatement(database, 'SELECT id FROM orders WHERE id = 99', writer());
    expect(report.text).toBe('(no rows)');
  });

  // A notification holds one line of text, and a result of a thousand rows is not one — so the line
  // carries the first of them and the file carries all of them, which is the arrangement an
  // auto-approved permission prompt's screen capture already uses.
  it('shortens a long result and links a file holding every row', () => {
    manyRows(REPORT_LINE_BUDGET * 2);
    const { report } = readStatement(database, 'SELECT id FROM many', writer());
    const lines = report.text.split('\n');
    expect(lines[0]).toBe('id');
    expect(lines).toHaveLength(REPORT_LINE_BUDGET + 2);
    expect(lines.at(-1)).toBe(`(${(REPORT_LINE_BUDGET * 2).toLocaleString('en-US')} rows — first ${REPORT_LINE_BUDGET} shown)`);
    expect(report.file).toMatch(/shop-result-2026-01-02T03-04-05-678Z\.txt$/u);

    const whole = readFileSync(report.file as string, 'utf8');
    const every = Array.from({ length: REPORT_LINE_BUDGET * 2 }, (_, i) => String(i + 1));
    expect(whole).toBe(`${every.join('\n')}\n(${(REPORT_LINE_BUDGET * 2).toLocaleString('en-US')} rows)\n`);
  });

  it('keeps the grid to its own ceiling, whatever the report holds', () => {
    manyRows(CONSOLE_ROW_LIMIT + 5);
    const { grid } = readStatement(database, 'SELECT id FROM many', writer());
    expect(grid.rows).toHaveLength(CONSOLE_ROW_LIMIT);
    expect(grid.truncated).toBe(true);
  });

  // A result of a million rows is a query to narrow, not a file to write — and the line has to say
  // which of the two it is, or a capped file reads as a complete one.
  it('says so when the result is too long to write out in full', () => {
    manyRows(RESULT_ROW_LIMIT + 5);
    const { report, grid } = readStatement(database, 'SELECT id FROM many', writer());
    expect(report.text).toMatch(/rows read, 1,000,000 written to the file\)$/u);
    expect(readFileSync(report.file as string, 'utf8')).toContain(
      `capped at ${RESULT_ROW_LIMIT.toLocaleString('en-US')}`,
    );
    expect(grid.truncated).toBe(true);
  }, 60_000);

  // A host with nowhere to put a file still reports the result, and a statement that ran perfectly
  // well is not a statement that failed.
  it('shortens rather than files when there is nowhere to put a file', () => {
    manyRows(REPORT_LINE_BUDGET * 2);
    const { report } = readStatement(database, 'SELECT id FROM many', noFiles);
    expect(report.file).toBeUndefined();
    expect(report.text).toContain(`first ${REPORT_LINE_BUDGET} shown`);
    expect(report.text.split('\n')).toHaveLength(REPORT_LINE_BUDGET + 2);
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
    expect(report.text).toBe('n\n0\n(1 row)');
    expect(database.prepare('SELECT n FROM counted').all()).toEqual(before);
  });
});
