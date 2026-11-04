import { describe, expect, it, vi } from 'vitest';
import type { JanusClient } from '../shared/ws/ws';
import { harnessTabIntents, openConnectionRow } from './harness-tab-intents';

function fakeClient() {
  const send = vi.fn();
  return { client: { send } as unknown as JanusClient, send };
}

describe('harnessTabIntents', () => {
  it('sends the metadata actions for its tab label', () => {
    const { client, send } = fakeClient();
    const intents = harnessTabIntents(client, 'agent2', 'openTranscriptFileFor');

    intents.onOpenFileNavigator();
    intents.onLaunchShellHere();
    intents.onOpenTranscript();

    expect(send).toHaveBeenNthCalledWith(1, { method: 'openFileNavigatorFor', params: { label: 'agent2' } });
    expect(send).toHaveBeenNthCalledWith(2, { method: 'launchShellFor', params: { label: 'agent2' } });
    expect(send).toHaveBeenNthCalledWith(3, { method: 'openTranscriptFileFor', params: { label: 'agent2' } });
  });

  it('sends transcript and ACP connection intents', () => {
    const { client, send } = fakeClient();
    const intents = harnessTabIntents(client, 'agent2', 'openTranscriptFileFor');
    const acpRef = { scope: 'tab' as const, label: 'agent2' };

    intents.onToggleCollapse();
    intents.onOpenAcpTranscript(acpRef);

    expect(send).toHaveBeenNthCalledWith(1, { method: 'toggleCollapse', params: {} });
    expect(send).toHaveBeenNthCalledWith(2, { method: 'openAcpTranscript', params: { acpRef } });
  });

  it('opens a record row and this tab\'s tab-scoped ACP row through the record RPC', () => {
    const { client, send } = fakeClient();

    openConnectionRow(client, 'agent2', { text: 'Agent: task.md', kind: 'acp', recordId: 'record-1' });
    openConnectionRow(client, 'agent2', { text: 'acp:opencode', kind: 'acp', acpRef: { scope: 'tab', label: 'agent2' } });

    expect(send).toHaveBeenNthCalledWith(1, {
      method: 'openConnectionRecord', params: { tab: 'agent2', recordId: 'record-1' },
    });
    expect(send).toHaveBeenNthCalledWith(2, {
      method: 'openConnectionRecord', params: { tab: 'agent2', acpRef: { scope: 'tab', label: 'agent2' } },
    });
  });

  it.each([
    ['monitor', { scope: 'monitor' as const, name: 'watch' }],
    ['editor', { scope: 'editor' as const, label: 'agent2', persona: 'reviewer' }],
    ['another tab', { scope: 'tab' as const, label: 'other' }],
  ])('leaves a %s row snapshot-only', (_case, acpRef) => {
    const { client, send } = fakeClient();

    openConnectionRow(client, 'agent2', { text: 'row', kind: 'acp', acpRef });

    expect(send).not.toHaveBeenCalled();
  });

  it('sends the transcript method its caller supplied', () => {
    const { client, send } = fakeClient();
    const intents = harnessTabIntents(client, 'claude', 'openTranscriptFileFor');

    intents.onOpenTranscript();

    expect(send).toHaveBeenCalledWith({ method: 'openTranscriptFileFor', params: { label: 'claude' } });
  });

  it('does not send until an intent is invoked', () => {
    const { client, send } = fakeClient();
    harnessTabIntents(client, 'agent2', 'openTranscriptFileFor');
    expect(send).not.toHaveBeenCalled();
  });
});
