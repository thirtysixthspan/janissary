import { describe, expect, it, vi } from 'vitest';
import type { JanusClient } from '../ws';
import { harnessTabIntents } from './harness-tab-intents';

function fakeClient() {
  const send = vi.fn();
  return { client: { send } as unknown as JanusClient, send };
}

describe('harnessTabIntents', () => {
  it('sends the metadata actions for its tab label', () => {
    const { client, send } = fakeClient();
    const intents = harnessTabIntents(client, 'agent2', 'openHarnessTranscriptFor');

    intents.onOpenFileNavigator();
    intents.onLaunchShellHere();
    intents.onOpenTranscript();

    expect(send).toHaveBeenNthCalledWith(1, { method: 'openFileNavigatorFor', params: { label: 'agent2' } });
    expect(send).toHaveBeenNthCalledWith(2, { method: 'launchShellFor', params: { label: 'agent2' } });
    expect(send).toHaveBeenNthCalledWith(3, { method: 'openHarnessTranscriptFor', params: { label: 'agent2' } });
  });

  it('sends transcript and ACP connection intents', () => {
    const { client, send } = fakeClient();
    const intents = harnessTabIntents(client, 'agent2', 'openHarnessTranscriptFor');
    const acpRef = { scope: 'tab' as const, label: 'agent2' };

    intents.onToggleCollapse();
    intents.onOpenAcpTranscript(acpRef);

    expect(send).toHaveBeenNthCalledWith(1, { method: 'toggleCollapse', params: {} });
    expect(send).toHaveBeenNthCalledWith(2, { method: 'openAcpTranscript', params: { acpRef } });
  });

  it('sends the transcript method its caller supplied', () => {
    const { client, send } = fakeClient();
    const intents = harnessTabIntents(client, 'claude', 'openHarnessTranscriptFor');

    intents.onOpenTranscript();

    expect(send).toHaveBeenCalledWith({ method: 'openHarnessTranscriptFor', params: { label: 'claude' } });
  });

  it('does not send until an intent is invoked', () => {
    const { client, send } = fakeClient();
    harnessTabIntents(client, 'agent2', 'openHarnessTranscriptFor');
    expect(send).not.toHaveBeenCalled();
  });
});
