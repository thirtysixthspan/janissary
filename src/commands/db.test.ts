import { describe, it, expect, vi } from 'vitest';
import type { Managers } from '../managers.js';
import type { CommandInvocationContext } from './types.js';
import { command } from './db.js';

function managersWith(): Managers {
  return {
    database: { runInTab: vi.fn(() => 'query result') },
    tab: { append: vi.fn(), appendForInvocation: vi.fn() },
  } as unknown as Managers;
}

const invocation: CommandInvocationContext = {
  runId: 'run', invocationId: 'invocation',
  caller: { label: 'janus', cwd: process.cwd(), context: [] },
  signal: new AbortController().signal, awaitResult: true, acpTool: true,
};

describe('db command', () => {
  it('has the correct name', () => {
    expect(command.name).toBe('db');
  });

  it('matches db commands', () => {
    expect(command.match('db sqlite query mydb SELECT 1')).toBe(true);
    expect(command.match('DB sqlite query mydb SELECT 1')).toBe(true);
    expect(command.match('db')).toBe(true);
  });

  it('does not match non-db input', () => {
    expect(command.match('dbs')).toBe(false);
    expect(command.match('db_extra')).toBe(false);
    expect(command.match('clear')).toBe(false);
  });

  it('returns the database text for an ACP invocation without appending it', () => {
    const managers = managersWith();

    expect(command.run('db sqlite list', { label: 'janus', index: 0 }, managers, invocation))
      .toBe('query result');
    expect(managers.database.runInTab).toHaveBeenCalledWith('janus', 'db sqlite list');
    expect(managers.tab.appendForInvocation).not.toHaveBeenCalled();
    expect(managers.tab.append).not.toHaveBeenCalled();
  });

  it('still appends the database output for an ordinary invocation', () => {
    const managers = managersWith();

    command.run('db sqlite list', { label: 'janus', index: 0 }, managers);

    expect(managers.database.runInTab).toHaveBeenCalledWith('janus', 'db sqlite list');
    expect(managers.tab.append).toHaveBeenCalledWith('janus', {
      input: 'db sqlite list', output: 'query result',
    });
  });
});
