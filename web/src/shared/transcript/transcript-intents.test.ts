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

  it('turns onPromoteToTerminal into a promote request carrying no parameters', () => {
    const { client, send } = fakeClient();
    transcriptIntents(client).onPromoteToTerminal();
    expect(send).toHaveBeenCalledWith({ method: 'promoteToTerminal', params: {} });
  });

  // Each intent is one call on the object, not a fresh one: a renderer that re-derives them per
  // render would send through a different client reference each time.
  it('returns the same four callbacks however many times it is asked', () => {
    const { client } = fakeClient();
    const first = transcriptIntents(client);
    const second = transcriptIntents(client);

    const names = (value: object) => Object.keys(value).toSorted((a, b) => a.localeCompare(b));
    expect(names(first)).toEqual(['onEditFile', 'onFocusTab', 'onOpenFile', 'onPromoteToTerminal']);
    expect(names(second)).toEqual(names(first));
  });
});
