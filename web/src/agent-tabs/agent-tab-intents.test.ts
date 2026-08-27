import { describe, expect, it, vi } from 'vitest';
import type { JanusClient } from '../ws';
import { agentTabIntents } from './agent-tab-intents';

function fakeClient() {
  const send = vi.fn();
  return { client: { send } as unknown as JanusClient, send };
}

describe('agentTabIntents', () => {
  it('sends the metadata actions for its tab label', () => {
    const { client, send } = fakeClient();
    const intents = agentTabIntents(client, 'agent2');

    intents.onOpenFileNavigator();
    intents.onLaunchAgentHere();
    intents.onOpenTranscript();

    expect(send).toHaveBeenNthCalledWith(1, { method: 'openFileNavigatorFor', params: { label: 'agent2' } });
    expect(send).toHaveBeenNthCalledWith(2, { method: 'launchAgentFor', params: { label: 'agent2' } });
    expect(send).toHaveBeenNthCalledWith(3, { method: 'openTranscriptFor', params: { label: 'agent2' } });
  });

  it('sends transcript and ACP connection intents', () => {
    const { client, send } = fakeClient();
    const intents = agentTabIntents(client, 'agent2');
    const acpRef = { scope: 'tab' as const, label: 'agent2' };

    intents.onToggleCollapse();
    intents.onOpenAcpTranscript(acpRef);

    expect(send).toHaveBeenNthCalledWith(1, { method: 'toggleCollapse', params: {} });
    expect(send).toHaveBeenNthCalledWith(2, { method: 'openAcpTranscript', params: { acpRef } });
  });

  it('does not send until an intent is invoked', () => {
    const { client, send } = fakeClient();
    agentTabIntents(client, 'agent2');
    expect(send).not.toHaveBeenCalled();
  });
});
