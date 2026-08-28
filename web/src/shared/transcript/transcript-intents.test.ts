import { describe, expect, it, vi } from 'vitest';
import type { JanusClient } from '../../ws';
import { transcriptIntents } from './transcript-intents';

function fakeClient() {
  const send = vi.fn();
  return { client: { send } as unknown as JanusClient, send };
}

describe('transcriptIntents', () => {
  it('turns onOpenFile into an open command', () => {
    const { client, send } = fakeClient();
    transcriptIntents(client).onOpenFile('https://example.com');
    expect(send).toHaveBeenCalledWith({ method: 'command', params: { text: 'open https://example.com' } });
  });

  it('turns onEditFile into an edit command', () => {
    const { client, send } = fakeClient();
    transcriptIntents(client).onEditFile('src/foo.ts:42');
    expect(send).toHaveBeenCalledWith({ method: 'command', params: { text: 'edit src/foo.ts:42' } });
  });

  it('turns onFocusTab into a focusTab request', () => {
    const { client, send } = fakeClient();
    transcriptIntents(client).onFocusTab('build');
    expect(send).toHaveBeenCalledWith({ method: 'focusTab', params: { label: 'build' } });
  });

  it('sends nothing until an intent is invoked', () => {
    const { client, send } = fakeClient();
    transcriptIntents(client);
    expect(send).not.toHaveBeenCalled();
  });
});
