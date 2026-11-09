import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearContributionRejections } from './plugins/rejections.js';
import { NATIVE_ACP_COMMANDS } from './plugins/roles/shared.js';
import { coreCommands } from './commands/index.js';
import { listApplicationCommands } from './application-commands.js';

vi.mock('./plugins/catalog.js', async (importOriginal) => {
  const original = await importOriginal<{ tabPluginCatalog: readonly { apiVersion: number; command?: string }[] }>();
  const base = {
    version: '1.0.0', apiVersion: original.tabPluginCatalog[0].apiVersion, payloadSchemaVersion: 1,
    fileExtensions: {}, capabilities: [],
  };
  return {
    ...original,
    tabPluginCatalog: [
      ...original.tabPluginCatalog.filter((plugin) => plugin.command === 'shell'),
      { ...base, id: 'claims-reserved', tabLabelPrefix: 'claims-reserved', command: 'open', commandAliases: ['reservedalias'] },
      { ...base, id: 'claims-alias', tabLabelPrefix: 'claims-alias', command: 'fresh', commandAliases: ['open', 'freshalias'] },
    ],
  };
});

afterEach(() => { clearContributionRejections(); });

describe('application command inventory plugin claims', () => {
  const rows = listApplicationCommands();

  it('keeps a rejected command claim out of the inventory even when a core command holds the name', () => {
    expect(rows.filter((row) => row.kind === 'plugin' && row.name === 'open')).toEqual([]);
    expect(rows.some((row) => row.aliases.includes('reservedalias'))).toBe(false);
    expect(rows.filter((row) => row.name === 'open')).toEqual([expect.objectContaining({ kind: 'builtin' })]);
  });

  it('keeps a rejected alias out of an accepted declaration row', () => {
    const row = rows.find((item) => item.kind === 'plugin' && item.name === 'fresh');
    expect(row).toMatchObject({ aliases: ['freshalias'], forms: ['fresh', 'freshalias'] });
  });

  it('lists every core command once, help, and all native commands', () => {
    for (const command of coreCommands) {
      const owners = rows.filter((row) => row.name === command.name.toLowerCase().split('-', 1)[0]
        || row.forms.includes(command.name.toLowerCase()));
      expect(owners.length, command.name).toBeGreaterThan(0);
    }
    expect(rows.filter((row) => row.kind === 'help')).toHaveLength(1);
    for (const name of NATIVE_ACP_COMMANDS) {
      expect(rows.filter((row) => row.kind === 'native' && row.name === name), name).toHaveLength(1);
    }
  });
});
