import { describe, expect, it } from 'vitest';
import { COMMANDS_USAGE, parseCommand, type CommandNameRow } from './parse-command.js';

const ROWS: CommandNameRow[] = [
  { name: 'agent', aliases: [], forms: ['agent'] },
  { name: 'ask', aliases: [], forms: ['ask'] },
  { name: 'ask', aliases: [], forms: ['ask reset'] },
  { name: 'browser goto', aliases: [], forms: ['browser goto'] },
  { name: 'close', aliases: ['exit'], forms: ['close'] },
  { name: 'db', aliases: [], forms: ['db', 'db sqlite'] },
  { name: 'db sqlite query', aliases: [], forms: ['db sqlite query'] },
  { name: 'quit', aliases: [], forms: ['quit'] },
  { name: 'question', aliases: [], forms: ['question ask', 'question approve'] },
  { name: 'question ask', aliases: [], forms: ['question ask'] },
  { name: 'question approve', aliases: [], forms: ['question approve'] },
  { name: 'search', aliases: [], forms: ['search transcript'] },
];

function parse(argument: string) {
  return parseCommand(argument, ROWS);
}

describe('parseCommand', () => {
  it.each(['', ' '.repeat(3), '\t\n '])('opens on bare or whitespace-only arguments', (argument) => {
    expect(parse(argument)).toEqual({ kind: 'open' });
  });

  it('defaults enable and disable to the global setting', () => {
    expect(parse('enable quit')).toEqual({ kind: 'edit', name: 'quit', setting: 'enabled', value: true });
    expect(parse('disable quit')).toEqual({ kind: 'edit', name: 'quit', setting: 'enabled', value: false });
  });

  it('reads global and agent selectors case-insensitively', () => {
    expect(parse('enable GLOBAL Quit')).toEqual({ kind: 'edit', name: 'quit', setting: 'enabled', value: true });
    expect(parse('disable AGENT browser goto'))
      .toEqual({ kind: 'edit', name: 'browser goto', setting: 'agentAccess', value: false });
  });

  it('resolves multiword names, aliases, and fixed forms to the canonical setting key', () => {
    expect(parse('disable db sqlite query'))
      .toEqual({ kind: 'edit', name: 'db sqlite query', setting: 'enabled', value: false });
    expect(parse('disable db sqlite')).toEqual({ kind: 'edit', name: 'db', setting: 'enabled', value: false });
    expect(parse('disable exit')).toEqual({ kind: 'edit', name: 'close', setting: 'enabled', value: false });
    expect(parse('disable ask reset')).toEqual({ kind: 'edit', name: 'ask', setting: 'enabled', value: false });
    expect(parse('disable search transcript'))
      .toEqual({ kind: 'edit', name: 'search', setting: 'enabled', value: false });
  });

  it('prefers a canonical name over another row\'s fixed form', () => {
    expect(parse('enable question ask'))
      .toEqual({ kind: 'edit', name: 'question ask', setting: 'enabled', value: true });
    expect(parse('disable agent question ask'))
      .toEqual({ kind: 'edit', name: 'question ask', setting: 'agentAccess', value: false });
    expect(parse('enable question approve'))
      .toEqual({ kind: 'edit', name: 'question approve', setting: 'enabled', value: true });
  });

  it('treats a lone agent as the command name and agent plus a name as the agent selector', () => {
    expect(parse('disable agent')).toEqual({ kind: 'edit', name: 'agent', setting: 'enabled', value: false });
    expect(parse('disable agent agent'))
      .toEqual({ kind: 'edit', name: 'agent', setting: 'agentAccess', value: false });
  });

  it('treats a lone global as a missing command', () => {
    expect(parse('enable global')).toEqual({ kind: 'error', message: COMMANDS_USAGE });
    expect(parse('disable global')).toEqual({ kind: 'error', message: COMMANDS_USAGE });
  });

  it('returns usage for malformed forms', () => {
    for (const argument of ['left', 'enable', 'disable', 'quit']) {
      expect(parse(argument)).toEqual({ kind: 'error', message: COMMANDS_USAGE });
    }
  });

  it('reports the typed remainder when no command matches exactly', () => {
    expect(parse('disable QUIT NOW')).toEqual({
      kind: 'error',
      message: 'Unknown application command: QUIT NOW.',
    });
    expect(parse('enable nope')).toEqual({
      kind: 'error',
      message: 'Unknown application command: nope.',
    });
    expect(parse('disable quit now')).toEqual({
      kind: 'error',
      message: 'Unknown application command: quit now.',
    });
    expect(parse('disable agent nope')).toEqual({
      kind: 'error',
      message: 'Unknown application command: nope.',
    });
  });

  it('collapses whitespace around the typed remainder', () => {
    expect(parse('  disable   quit   now  ')).toEqual({
      kind: 'error',
      message: 'Unknown application command: quit now.',
    });
  });
});
