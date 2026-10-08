import { afterEach, describe, expect, it, vi } from 'vitest';
import { CommandManager } from './manager.js';
import { CaptureManager } from '../capture/manager.js';
import { TabManager } from '../tab/manager.js';
import { seedRootAgentTab } from '../tab/root-agent-test-fixture.js';
import type { Managers } from '../managers.js';
import { messageBus } from '../bus.js';

function setup() {
  const shell = vi.fn();
  const database = vi.fn(() => 'query result');
  const prompt = vi.fn();
  const managers = {} as Managers;
  managers.tab = new TabManager(managers);
  seedRootAgentTab(managers.tab);
  managers.shell = { run: shell } as unknown as Managers['shell'];
  managers.database = { runInTab: database, openDbs: () => ['notes'] } as unknown as Managers['database'];
  managers.acp = { run: prompt } as unknown as Managers['acp'];
  managers.command = new CommandManager(managers);
  managers.capture = new CaptureManager(managers);
  return { managers, shell, database, prompt };
}

afterEach(() => { messageBus.clear(); });

describe('explicit command execution after routing removal', () => {
  it.each(['ls -la', 'select 1 as n', 'why is the sky blue?'])('refuses unprefixed %s without executing it', (input) => {
    const { managers, shell, database, prompt } = setup();
    managers.command.dispatch(input);
    expect(managers.tab.cur().log.at(-1)).toEqual({
      input, output: `Unknown command: "${input}". Type "help" for available commands.`, markdown: false,
    });
    expect(shell).not.toHaveBeenCalled();
    expect(database).not.toHaveBeenCalled();
    expect(prompt).not.toHaveBeenCalled();
  });

  it('answers targeted commands independently without holding a chooser slot', () => {
    const { managers } = setup();
    managers.command.dispatchTo('janus', 'select 1', { detect: false });
    managers.command.dispatchTo('janus', 'select 2', { detect: false });
    expect(managers.tab.cur().log.map(entry => entry.output)).toEqual([
      'Unknown command: "select 1". Type "help" for available commands.',
      'Unknown command: "select 2". Type "help" for available commands.',
    ]);
  });

  it.each(['ls -la', 'select 1', 'why is the sky blue?'])('answers a captured %s without executing it', (input) => {
    const { managers, shell, database, prompt } = setup();
    const reply = vi.fn();
    managers.capture.run('janus', input, reply);
    expect(reply).toHaveBeenCalledExactlyOnceWith(`Unknown command: "${input}". Type "help" for available commands.`);
    expect(shell).not.toHaveBeenCalled();
    expect(database).not.toHaveBeenCalled();
    expect(prompt).not.toHaveBeenCalled();
  });

  it.each(['shell echo hi', '!echo hi'])('keeps explicit %s executable', (input) => {
    const { managers, shell } = setup();
    managers.command.dispatch(input);
    expect(shell).toHaveBeenCalledWith('janus', 'echo hi', { detect: undefined });
  });

  it('keeps explicit database queries executable and capturable', async () => {
    const { managers, database } = setup();
    const input = 'db sqlite query notes SELECT 1';
    managers.command.dispatch(input);
    expect(database).toHaveBeenCalledWith('janus', input);
    expect(managers.tab.cur().log.at(-1)?.output).toBe('query result');
    const reply = vi.fn();
    managers.capture.run('janus', input, reply);
    await vi.waitFor(() => { expect(reply).toHaveBeenCalledWith('query result'); });
  });

  it('leaves unclaimed shell-bar input for the shell plugin to execute', async () => {
    const { managers, shell } = setup();
    await expect(managers.command.dispatchLineWithOutput('janus', 'ls -la')).resolves.toEqual({
      dispatched: false, output: '',
    });
    expect(shell).not.toHaveBeenCalled();
    expect(managers.tab.cur().log).toEqual([]);
  });
});
