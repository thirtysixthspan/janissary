import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { SqlConsoleResult } from '@shared/plugins/sql/shared';
import { SqlConsole } from './SqlConsole';
import { makeCapabilities } from './fixture';

// The statement history is the agent tab's `hist` picker: a panel over the command line, a selected
// row, and a picked row going into the line rather than running on the spot.
const LOG: SqlConsoleResult[] = [
  { sql: 'UPDATE orders SET status = ?', changed: 2 },
  { sql: 'DELETE FROM logs', changed: 1 },
  { sql: 'UPDATE nope', changed: 0, error: 'no such table: nope' },
];

// The field is stateful, because a picked statement landing in it is half of what a pick means —
// there is nothing to check otherwise, since the console reads what the frame holds.
function Console({ log, onIntent }: { log: readonly SqlConsoleResult[]; onIntent(name: string, body: unknown): void }) {
  const [value, setValue] = useState('');
  return (
    <SqlConsole
      active
      busy={false}
      log={log}
      onClearLog={() => onIntent('clear-log', {})}
      value={value}
      onValue={setValue}
      onSend={(sql) => onIntent('run', { sql })}
    />
  );
}

function shown(log: readonly SqlConsoleResult[] = LOG) {
  const { intent } = makeCapabilities();
  render(<Console log={log} onIntent={intent} />);
  return { intent };
}

const open = () => fireEvent.click(screen.getByLabelText('Statement history'));
const rows = () => [...document.querySelectorAll('.sql-history-row')].map((row) => row.textContent);
const selected = () => [...document.querySelectorAll('.sql-history-row.selected')].map((row) => row.textContent);
const expanded = () => screen.getByLabelText('Statement history').getAttribute('aria-expanded');
const line = () => screen.getByLabelText('SQL') as HTMLTextAreaElement;
const press = (key: string) => fireEvent.keyDown(line(), { key });

describe('the statement history', () => {
  it('lists every statement the tab has run, newest first, with what each did', () => {
    shown();
    open();
    expect(rows()).toEqual([
      'UPDATE orders SET status = ?2 rows changed.',
      'DELETE FROM logs1 row changed.',
      'UPDATE nopeno such table: nope',
    ]);
  });

  it('draws exactly the log it is handed, so the line under the prompt and the panel cannot disagree', () => {
    shown([{ sql: 'CREATE TABLE t (a)', changed: 0 }]);
    open();
    expect(rows()).toEqual(['CREATE TABLE t (a)OK.']);
  });

  it('selects the newest statement, which is the one the tab ran last', () => {
    shown();
    open();
    expect(selected()[0]).toContain('UPDATE orders SET status = ?');
  });

  it('says so on a tab that has run nothing, and offers nothing to clear', () => {
    shown([]);
    open();
    expect(screen.getByText('(no history)')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Clear log' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('empties the log on request', () => {
    const { intent } = shown();
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Clear log' }));
    expect(intent).toHaveBeenCalledWith('clear-log', {});
  });

  it('puts a picked statement in the line rather than running it on the spot', () => {
    const { intent } = shown();
    open();
    fireEvent.click(screen.getByText('DELETE FROM logs'));
    expect(line().value).toBe('DELETE FROM logs');
    expect(intent).not.toHaveBeenCalled();
    expect(expanded()).toBe('false');
  });

  it('puts the selected statement in the line on Enter, and sends it only on the next Enter', () => {
    const { intent } = shown();
    open();
    press('ArrowDown');
    press('Enter');
    expect(line().value).toBe('DELETE FROM logs');
    expect(intent).not.toHaveBeenCalled();
    press('Enter');
    expect(intent).toHaveBeenCalledWith('run', { sql: 'DELETE FROM logs' });
  });

  it('moves the selection a row at a time and stops at the ends', () => {
    shown();
    open();
    press('ArrowUp');
    expect(selected()).toHaveLength(1);
    press('ArrowDown');
    press('ArrowDown');
    expect(selected()[0]).toContain('UPDATE nope');
    press('ArrowDown');
    expect(selected()[0]).toContain('UPDATE nope');
    press('Home');
    expect(selected()[0]).toContain('UPDATE orders SET status = ?');
  });

  it('closes on Escape, sending nothing and leaving the line as it was', () => {
    const { intent } = shown();
    open();
    press('Escape');
    expect(intent).not.toHaveBeenCalled();
    expect(line().value).toBe('');
    expect(expanded()).toBe('false');
  });

  // The picker is modal while it is open, which is what the agent bar's is: Enter belongs to the
  // panel and not to the line, or a pick would submit the line as well.
  it('keeps the console out of the way while it is open, and takes the keys back once it closes', () => {
    const { intent } = shown();
    open();
    press('Escape');
    press('Enter');
    expect(intent).not.toHaveBeenCalled();
  });
});

describe('the SQL command bar', () => {
  it('prompts with the word SQL, so a bare chevron is not read as the application command line', () => {
    shown();
    expect(screen.getByText('SQL')).toBeTruthy();
  });

  it('sends what is typed on Enter', () => {
    const { intent } = shown();
    fireEvent.change(line(), { target: { value: 'SELECT 1' } });
    press('Enter');
    expect(intent).toHaveBeenCalledWith('run', { sql: 'SELECT 1' });
  });
});
