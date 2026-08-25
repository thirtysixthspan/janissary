import type { AcpRef } from '@shared/protocol';
import type { JanusClient } from './ws';

export type AgentTabIntents = {
  onOpenFileNavigator: () => void;
  onLaunchAgentHere: () => void;
  onOpenTranscript: () => void;
  onToggleCollapse: () => void;
  onOpenAcpTranscript: (acpRef: AcpRef) => void;
};

export function agentTabIntents(client: JanusClient, label: string): AgentTabIntents {
  return {
    onOpenFileNavigator: () => client.send({ method: 'openFileNavigatorFor', params: { label } }),
    onLaunchAgentHere: () => client.send({ method: 'launchAgentFor', params: { label } }),
    onOpenTranscript: () => client.send({ method: 'openTranscriptFor', params: { label } }),
    onToggleCollapse: () => client.send({ method: 'toggleCollapse', params: {} }),
    onOpenAcpTranscript: (acpRef) => client.send({ method: 'openAcpTranscript', params: { acpRef } }),
  };
}
