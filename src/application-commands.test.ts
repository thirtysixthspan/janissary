import { describe, expect, it } from 'vitest';
import { listApplicationCommands, resolveApplicationCommand } from './application-commands.js';

describe('application command inventory', () => {
  const rows = listApplicationCommands();

  it('lists built-ins, bundled plugins, help, and native ACP forms alphabetically', () => {
    expect(rows.some((row) => row.kind === 'builtin' && row.name === 'tab')).toBe(true);
    expect(rows.some((row) => row.kind === 'plugin' && row.name === 'conversations')).toBe(true);
    expect(rows.some((row) => row.kind === 'help' && row.name === 'help')).toBe(true);
    expect(rows.some((row) => row.kind === 'native' && row.name === 'db sqlite query')).toBe(true);
    expect(rows.map((row) => row.name)).toEqual(rows.map((row) => row.name).toSorted((a, b) => a.localeCompare(b)));
  });

  it('normalizes aliases, case, and whitespace without including argument text in forms', () => {
    expect(resolveApplicationCommand('  CONVERSATION   title ')?.name).toBe('conversations');
    expect(resolveApplicationCommand(' DB   SQLITE QUERY   inventory select * ')?.name).toBe('db sqlite query');
    expect(rows.find((row) => row.name === 'db sqlite query')?.forms).toEqual(['db sqlite query']);
  });

  it('keeps native tool and parent relationships explicit', () => {
    expect(rows.find((row) => row.name === 'browser goto')).toMatchObject({ parent: 'browser', nativeTool: 'browser' });
    expect(rows.find((row) => row.name === 'db sqlite query')).toMatchObject({ parent: 'db sqlite', nativeTool: 'database' });
    expect(rows.find((row) => row.name === 'question approve')?.nativeTool).toBe('question');
  });

  it('resolves the search owner before selecting its longest fixed form', () => {
    expect(resolveApplicationCommand('search query')).toMatchObject({ kind: 'plugin', name: 'search' });
    expect(resolveApplicationCommand('search transcript fox')).toMatchObject({ kind: 'builtin', name: 'search' });
  });
});
