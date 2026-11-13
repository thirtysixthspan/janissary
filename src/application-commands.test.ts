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
    expect(rows.find((row) => row.name === 'file read')).toMatchObject({ kind: 'native', parent: 'file', nativeTool: 'file' });
    expect(rows.find((row) => row.name === 'file write')).toMatchObject({ kind: 'native', parent: 'file', nativeTool: 'file' });
    expect(rows.find((row) => row.name === 'file edit')).toMatchObject({ kind: 'native', parent: 'file', nativeTool: 'file' });
    expect(resolveApplicationCommand('file write {"path":"a.md"}')?.name).toBe('file write');
    expect(resolveApplicationCommand('file edit {')?.name).toBe('file edit');
  });

  it('gives each built-in fixed subcommand form its own row linked to its parent', () => {
    expect(rows.find((row) => row.name === 'tab')?.forms).toEqual(['tab']);
    for (const name of ['tab dock', 'tab undock', 'files expand', 'layout window', 'notifications clear', 'schedule cancel', 'open external', 'db sqlite', 'unmonitor --all']) {
      const parent = name.split(' ', 1)[0];
      expect(rows.find((row) => row.name === name)).toMatchObject({ kind: 'builtin', forms: [name], parent });
    }
    expect(rows.find((row) => row.name === 'db sqlite query')?.parent).toBe('db sqlite');
    expect(resolveApplicationCommand('tab dock x')).toMatchObject({ name: 'tab dock', forms: ['tab dock'] });
    expect(resolveApplicationCommand('tab')).toMatchObject({ name: 'tab' });
  });

  it('resolves the search owner before selecting its longest fixed form', () => {
    expect(resolveApplicationCommand('search query')).toMatchObject({ kind: 'plugin', name: 'search' });
    expect(resolveApplicationCommand('search transcript fox')).toMatchObject({ kind: 'builtin', name: 'search' });
  });

  it('lists exactly one plugin row for the commands command', () => {
    const matches = rows.filter((row) => row.kind === 'plugin' && row.name === 'commands');
    expect(matches).toHaveLength(1);
    expect(resolveApplicationCommand('commands enable browser goto'))
      .toMatchObject({ kind: 'plugin', name: 'commands' });
  });

  it('builds builtin rows from core commands once, without the shell alias row', () => {
    expect(rows.filter((row) => row.forms.includes('search transcript'))).toHaveLength(1);
    expect(rows.some((row) => row.forms.includes('!'))).toBe(false);
    expect(rows.some((row) => row.name === '!')).toBe(false);
    expect(rows.find((row) => row.name === 'shell')?.kind).toBe('plugin');
  });

  it('keeps name and form pairs unique while retaining the intentional canonical duplicates', () => {
    const pairs = rows.map((row) => JSON.stringify([row.name, row.forms]));
    expect(new Set(pairs).size).toBe(pairs.length);
    expect(rows.filter((row) => row.name === 'ask').map((row) => row.forms.join('|')).toSorted((left, right) => left.localeCompare(right)))
      .toEqual(['ask', 'ask reset']);
    expect(rows.filter((row) => row.name === 'tell').map((row) => row.forms.join('|')).toSorted((left, right) => left.localeCompare(right)))
      .toEqual(['tell', 'tell reset']);
  });

  it('selects the fixed form that carries the canonical policy key', () => {
    expect(resolveApplicationCommand('ask reset')).toMatchObject({ name: 'ask', forms: ['ask reset'] });
    expect(resolveApplicationCommand('browser goto https://example.com'))
      .toMatchObject({ name: 'browser goto', forms: ['browser goto'] });
    expect(resolveApplicationCommand('db sqlite query inventory select *'))
      .toMatchObject({ name: 'db sqlite query', forms: ['db sqlite query'] });
    expect(resolveApplicationCommand('question ask hello'))
      .toMatchObject({ name: 'question ask', forms: ['question ask'] });
    expect(resolveApplicationCommand('question approve 1'))
      .toMatchObject({ name: 'question approve', forms: ['question approve'] });
  });

  it('lists the file command as a parentless builtin while the native row owns file read input', () => {
    const file = rows.find((row) => row.kind === 'builtin' && row.name === 'file');
    expect(file?.forms).toEqual(['file']);
    expect(file?.parent).toBeUndefined();
    expect(resolveApplicationCommand('file read a.md'))
      .toMatchObject({ name: 'file read', kind: 'native', forms: ['file read'] });
    expect(resolveApplicationCommand('file')).toMatchObject({ name: 'file', kind: 'builtin', forms: ['file'] });
  });
});
