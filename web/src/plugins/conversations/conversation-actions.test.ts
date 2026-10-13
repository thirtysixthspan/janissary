import { describe, expect, it, vi } from 'vitest';
import { createConversationActions } from './conversation-actions';

describe('createConversationActions', () => {
  it('maps conversation actions to their intents and payloads', () => {
    const intent = vi.fn(async () => null);
    const actions = createConversationActions(intent);

    actions.rename('Notes');
    actions.send('Hello');
    actions.selectModel('claude:claude-sonnet');
    actions.cancel();
    actions.openFiles();
    actions.launchShell();
    actions.loadOlder();

    expect(intent.mock.calls).toEqual([
      ['rename', { title: 'Notes' }],
      ['send', { query: 'Hello' }],
      ['select-model', { harness: 'claude', model: 'claude-sonnet' }],
      ['cancel', {}],
      ['open-files', {}],
      ['launch-shell', {}],
      ['load-older', {}],
    ]);
  });

  it('preserves colons inside a model id', () => {
    const intent = vi.fn(async () => null);
    const actions = createConversationActions(intent);

    actions.selectModel('opencode:provider:model:variant');

    expect(intent).toHaveBeenCalledWith('select-model', {
      harness: 'opencode', model: 'provider:model:variant',
    });
  });
});
