import { describe, expect, it } from 'vitest';
import type { CommandsTopicNotification } from '../api.js';
import { isCommandsData, toPayload } from './payload.js';

type SourceCommand = CommandsTopicNotification['data']['commands'][number];

function row(overrides: Partial<SourceCommand> & Pick<SourceCommand, 'name' | 'forms'>): SourceCommand {
  return {
    kind: 'builtin',
    aliases: [],
    enabled: true,
    agentAccess: true,
    effectiveEnabled: true,
    effectiveAgentAccess: true,
    ...overrides,
  };
}

const DATA: CommandsTopicNotification['data'] = {
  commands: [
    row({ name: 'ask', forms: ['ask'] }),
    row({ name: 'ask', forms: ['ask reset'], parent: 'ask' }),
    row({ name: 'close', aliases: ['exit'], forms: ['close'] }),
    row({ name: 'db', forms: ['db', 'db sqlite'] }),
    row({ name: 'db sqlite query', kind: 'native', forms: ['db sqlite query'], parent: 'db sqlite', nativeTool: 'database' }),
    row({ name: 'tell', forms: ['tell'], parent: 'exit' }),
    row({ name: 'tell', forms: ['tell reset'], parent: 'tell' }),
    row({ name: 'search', forms: ['search transcript'], parent: 'search' }),
    row({ name: 'question', forms: ['question ask', 'question approve'] }),
    row({ name: 'question ask', kind: 'native', forms: ['question ask'], parent: 'question', nativeTool: 'question' }),
    row({ name: 'question approve', kind: 'native', forms: ['question approve'], parent: 'question', nativeTool: 'question' }),
    row({ name: 'orphan', forms: ['orphan'], parent: 'missing parent' }),
  ],
  source: 'home',
  path: '/home/me/.janissary/commands.json',
  problem: 'commands.json is damaged.',
};

const ROW = DATA.commands[0];

function withRow(overrides: Record<string, unknown>): unknown {
  return { ...DATA, commands: [{ ...ROW, ...overrides }] };
}

describe('isCommandsData', () => {
  it('accepts a complete snapshot and an empty command list', () => {
    expect(isCommandsData(DATA)).toBe(true);
    expect(isCommandsData({ ...DATA, commands: [] })).toBe(true);
    expect(isCommandsData({ ...DATA, problem: undefined })).toBe(true);
  });

  it('accepts a row without a parent or native tool', () => {
    expect(isCommandsData({ ...DATA, commands: [row({ name: 'quit', forms: ['quit'] })] })).toBe(true);
  });

  it.each([
    ['null', null],
    ['an array', []],
    ['a string', 'commands'],
    ['missing commands', { ...DATA, commands: undefined }],
    ['a non-array commands field', { ...DATA, commands: {} }],
    ['a non-object row', { ...DATA, commands: [null] }],
    ['a missing name', withRow({ name: undefined })],
    ['a mistyped name', withRow({ name: 7 })],
    ['a missing kind', withRow({ kind: undefined })],
    ['an unknown kind', withRow({ kind: 'terminal' })],
    ['missing aliases', withRow({ aliases: undefined })],
    ['mistyped aliases', withRow({ aliases: [7] })],
    ['missing forms', withRow({ forms: undefined })],
    ['mistyped forms', withRow({ forms: 'ask' })],
    ['a mistyped parent', withRow({ parent: 4 })],
    ['an unknown native tool', withRow({ nativeTool: 'terminal' })],
    ['a mistyped native tool', withRow({ nativeTool: 4 })],
    ['a missing enabled flag', withRow({ enabled: undefined })],
    ['a mistyped enabled flag', withRow({ enabled: 'yes' })],
    ['a missing agentAccess flag', withRow({ agentAccess: undefined })],
    ['a mistyped agentAccess flag', withRow({ agentAccess: 'yes' })],
    ['a missing effectiveEnabled flag', withRow({ effectiveEnabled: undefined })],
    ['a mistyped effectiveEnabled flag', withRow({ effectiveEnabled: 1 })],
    ['a missing effectiveAgentAccess flag', withRow({ effectiveAgentAccess: undefined })],
    ['a mistyped effectiveAgentAccess flag', withRow({ effectiveAgentAccess: 'yes' })],
    ['a missing source', { ...DATA, source: undefined }],
    ['an unknown source', { ...DATA, source: 'workspace' }],
    ['a mistyped source', { ...DATA, source: 4 }],
    ['a missing path', { ...DATA, path: undefined }],
    ['a mistyped path', { ...DATA, path: 4 }],
    ['a mistyped problem', { ...DATA, problem: 4 }],
    ['a mistyped overridden list', { ...DATA, overridden: 'clear' }],
    ['a mistyped overridden name', { ...DATA, overridden: [4] }],
  ])('rejects %s', (_label, value) => {
    expect(isCommandsData(value)).toBe(false);
  });
});

describe('toPayload', () => {
  it('maps rows in order with the name, first-form, and canonical-first-form labels', () => {
    const labels = toPayload(DATA).commands.map((command) => [command.name, command.label]);

    expect(labels).toEqual([
      ['ask', 'ask'],
      ['ask', 'ask reset'],
      ['close', 'close'],
      ['db', 'db'],
      ['db sqlite query', 'db sqlite query'],
      ['tell', 'tell'],
      ['tell', 'tell reset'],
      ['search', 'search transcript'],
      ['question', 'question'],
      ['question ask', 'question ask'],
      ['question approve', 'question approve'],
      ['orphan', 'orphan'],
    ]);
  });

  it('canonicalizes parents through a name, an alias, and a form, keeps an unmatched parent, and drops a parent equal to the name', () => {
    const parents = toPayload(DATA).commands.map((command) => [command.name, command.parent]);

    expect(parents).toEqual([
      ['ask', undefined],
      ['ask', undefined],
      ['close', undefined],
      ['db', undefined],
      ['db sqlite query', 'db'],
      ['tell', 'close'],
      ['tell', undefined],
      ['search', undefined],
      ['question', undefined],
      ['question ask', 'question'],
      ['question approve', 'question'],
      ['orphan', 'missing parent'],
    ]);
  });

  it('preserves nativeTool, problem, source, and path', () => {
    const payload = toPayload(DATA);

    expect(payload.source).toBe('home');
    expect(payload.path).toBe(DATA.path);
    expect(payload.problem).toBe('commands.json is damaged.');
    expect(payload.commands.find((command) => command.name === 'question ask'))
      .toMatchObject({ nativeTool: 'question' });
    expect(payload.commands.find((command) => command.name === 'ask')).not.toHaveProperty('nativeTool');
  });

  it('accepts and preserves the overridden names, and omits them when absent', () => {
    const data = { ...DATA, overridden: ['clear'] };

    expect(isCommandsData(data)).toBe(true);
    expect(toPayload(data).overridden).toEqual(['clear']);
    expect(toPayload(DATA)).not.toHaveProperty('overridden');
  });

  it('omits problem and nativeTool when they are absent', () => {
    const payload = toPayload({ ...DATA, commands: [ROW], problem: undefined });

    expect(payload).not.toHaveProperty('problem');
    expect(payload.commands[0]).not.toHaveProperty('nativeTool');
  });
});
