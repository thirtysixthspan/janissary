import type { AcpRef } from '@shared/protocol';
import type { JanusClient } from '../ws';

// Which transcript RPC the metadata row's clipboard button sends. Supplied by the caller rather
// than decided here: agent tabs and harness tabs open different transcripts, and branching on that
// would give this shared module knowledge of the features that use it.
export type TranscriptMethod = 'openTranscriptFor' | 'openHarnessTranscriptFor';

export type AgentTabIntents = {
  onOpenFileNavigator: () => void;
  onLaunchAgentHere: () => void;
  onOpenTranscript: () => void;
  onToggleCollapse: () => void;
  onOpenAcpTranscript: (acpRef: AcpRef) => void;
};

export function agentTabIntents(
  client: JanusClient,
  label: string,
  transcriptMethod: TranscriptMethod,
): AgentTabIntents {
  return {
    onOpenFileNavigator: () => client.send({ method: 'openFileNavigatorFor', params: { label } }),
    onLaunchAgentHere: () => client.send({ method: 'launchAgentFor', params: { label } }),
    onOpenTranscript: () => client.send({ method: transcriptMethod, params: { label } }),
    onToggleCollapse: () => client.send({ method: 'toggleCollapse', params: {} }),
    onOpenAcpTranscript: (acpRef) => client.send({ method: 'openAcpTranscript', params: { acpRef } }),
  };
}
