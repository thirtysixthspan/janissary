import { describe, expect, it } from 'vitest';
import type { CommandsTopicNotification } from '../api.js';
import { toPayload } from './payload.js';

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
    row({ name: 'question', forms: ['question ask', 'question approve'] }),
    row({ name: 'question ask', kind: 'native', forms: ['question ask'], parent: 'question', nativeTool: 'question' }),
    row({
      name: 'question approve', kind: 'native', forms: ['question approve'],
      parent: 'question', nativeTool: 'question',
    }),
    row({ name: 'search', forms: ['search transcript'], parent: 'search' }),
    row({ name: 'tell', forms: ['tell reset'], parent: 'tell' }),
  ],
  source: 'home',
  path: '/home/me/.janissary/commands.json',
};

describe('toPayload', () => {
  it('labels the builtin question row by name when its first form names the native question ask row', () => {
    const labels = toPayload(DATA).commands.map((command) => [command.name, command.label]);

    expect(labels).toEqual([
      ['ask', 'ask'],
      ['ask', 'ask reset'],
      ['question', 'question'],
      ['question ask', 'question ask'],
      ['question approve', 'question approve'],
      ['search', 'search transcript'],
      ['tell', 'tell reset'],
    ]);
  });
});
