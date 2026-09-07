import { describe, it, expect, vi } from 'vitest';
import { routeUnknownCommand } from './router.js';
import { unknownCommandMessage } from '../commands.js';
import type { Managers } from '../managers.js';

function makeManagers(openDbs: string[]): { managers: Managers; appended: unknown[] } {
  const appended: unknown[] = [];
  const managers = {
    tab: {
      append: (label: string, entry: unknown) => {
        appended.push({ label, entry });
      },
    },
    database: {
      openDbs: () => openDbs,
    },
  } as unknown as Managers;
  return { managers, appended };
}

describe('routeUnknownCommand', () => {
  it('appends and calls back with output when the command is a known built-in', () => {
    const { managers, appended } = makeManagers([]);
    const run = vi.fn();
    const callback = vi.fn();

    routeUnknownCommand('help', 'help', 'tab1', managers, run, callback);

    expect(run).not.toHaveBeenCalled();
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback.mock.calls[0][0]).toContain('help');
    expect(appended).toHaveLength(1);
  });

  it('routes to the db recognizer and rewrites the command when exactly one db is open', () => {
    const { managers } = makeManagers(['mydb']);
    const run = vi.fn();
    const callback = vi.fn();

    routeUnknownCommand('SELECT * FROM foo;', 'SELECT * FROM foo;', 'tab1', managers, run, callback);

    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith('tab1', 'db sqlite query mydb SELECT * FROM foo;', callback);
    expect(callback).not.toHaveBeenCalled();
  });

  // One spelling, built in one place. This tail used to construct its own shorter copy of the
  // message, so a reword of the other one silently left the two disagreeing.
  it('falls back to the one unknown-command message when nothing matches', () => {
    const { managers } = makeManagers([]);
    const run = vi.fn();
    const callback = vi.fn();

    routeUnknownCommand('clear', 'clear', 'tab1', managers, run, callback);

    expect(run).not.toHaveBeenCalled();
    expect(callback).toHaveBeenCalledWith(unknownCommandMessage('clear'));
    expect(callback).toHaveBeenCalledWith('Unknown command: "clear". Type "help" for available commands.');
  });

  // The empty string is why the `silent` arm survives: no registry predicate matches it, so it
  // reaches here rather than being answered by a command.
  it('answers an empty command the same way as an unrecognized one', () => {
    const { managers } = makeManagers([]);
    const callback = vi.fn();

    routeUnknownCommand('', '', 'tab1', managers, vi.fn(), callback);

    expect(callback).toHaveBeenCalledWith(unknownCommandMessage(''));
  });
});
