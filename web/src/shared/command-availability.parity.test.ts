import { describe, expect, it } from 'vitest';
import { listApplicationCommands, resolveApplicationCommand } from '@shared/application-commands';
import type { DisabledApplicationCommand } from '@shared/protocol';
import { disabledApplicationCommand } from './command-availability';

const INPUTS = [
  'question ask', 'question approve now', 'ask reset', 'ask something', 'tell reset',
  'search transcript', 'search transcript foo', 'browser goto', 'browser', 'theme sync',
  'exit', 'close tab', '  CLOSE   tab ', 'files expand', 'nonexistent command',
];

function disabledRows(): DisabledApplicationCommand[] {
  return listApplicationCommands().map(({ name, aliases, forms }) => ({ name, aliases, forms }));
}

describe('server resolver and client matcher parity', () => {
  it.each(INPUTS)('agree on the row that owns "%s"', (input) => {
    const server = resolveApplicationCommand(input);
    const client = disabledApplicationCommand(input, disabledRows());
    if (!server) {
      expect(client).toBeUndefined();
      return;
    }
    expect(client).toBeDefined();
    expect(client?.name).toBe(server.name);
    expect(client?.aliases).toEqual(server.aliases);
  });
});
