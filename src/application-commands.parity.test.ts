import { describe, expect, it } from 'vitest';
import { listApplicationCommands, resolveApplicationCommand } from './application-commands.js';
import { COMMAND_FORMS } from './commands/forms.js';
import { coreCommands } from './commands/index.js';

const rows = listApplicationCommands();
const registryNames = new Set(coreCommands.map((command) => command.name));

describe('application command forms parity', () => {
  it('declares forms for every core command except the shell plugin', () => {
    const missing = coreCommands
      .filter((command) => command.name !== 'shell')
      .filter((command) => !Object.hasOwn(COMMAND_FORMS, command.name))
      .map((command) => command.name);
    expect(missing).toEqual([]);
  });

  it('keeps no declaration for a command outside the registry', () => {
    const stale = Object.keys(COMMAND_FORMS).filter((name) => !registryNames.has(name));
    expect(stale).toEqual([]);
  });

  it('resolves every declared form to a row that carries it', () => {
    for (const [name, declaration] of Object.entries(COMMAND_FORMS)) {
      for (const form of declaration.forms) {
        const row = resolveApplicationCommand(form);
        expect(row, `${name} / ${form}`).toBeDefined();
        expect(row?.forms, `${name} / ${form}`).toContain(form);
      }
    }
  });

  it('names a real command row as every declared parent', () => {
    for (const [name, declaration] of Object.entries(COMMAND_FORMS)) {
      if (declaration.parent === undefined) continue;
      expect(rows.some((row) => row.name === declaration.parent), `${name} / ${declaration.parent}`).toBe(true);
    }
  });
});
