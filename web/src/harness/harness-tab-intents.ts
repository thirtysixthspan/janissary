import type { AcpRef, ConnectionView } from '@shared/protocol';
import type { JanusClient } from '../shared/ws/ws';

// Which transcript RPC the metadata row's clipboard button sends. Supplied by the caller rather
// than decided here: tabs and harness tabs open different transcripts, and branching on that
// would give this module knowledge of the tabs that use it.
export type TranscriptMethod = 'openTranscriptFileFor';

export type AgentTabIntents = {
  onOpenFileNavigator: () => void;
  onLaunchShellHere: () => void;
  onOpenTranscript: () => void;
  // Set only on a workspaced tab: the metadata row's diff button, which opens the diff tab on this
  // tab's own workspace.
  onOpenDiffHere?: () => void;
  onToggleCollapse: () => void;
  onOpenAcpTranscript: (acpRef: AcpRef) => void;
  // Only on a tab that has a recording, because it is the metadata row's own signal that there is
  // one: the row draws its flag inert when this is absent and pressable when it is set, so the two
  // cannot disagree. An tab never has one and so never sends it.
  onOpenRecording?: () => void;
};

// A popup row opens its connection tab through the connections command, with this tab as the
// owner. Only a durable record id or a tab-scoped ACP reference has a record tab to open; monitor
// and editor rows stay snapshot-only.
export function openConnectionRow(client: JanusClient, label: string, row: ConnectionView): void {
  if (row.recordId !== undefined) {
    client.send({ method: 'openConnectionRecord', params: { tab: label, recordId: row.recordId } });
    return;
  }
  if (row.acpRef?.scope !== 'tab' || row.acpRef.label !== label) return;
  client.send({ method: 'openConnectionRecord', params: { tab: label, acpRef: row.acpRef } });
}

export function harnessTabIntents(
  client: JanusClient,
  label: string,
  transcriptMethod: TranscriptMethod,
  recording?: string,
  workspaced?: boolean,
): AgentTabIntents {
  return {
    onOpenFileNavigator: () => client.send({ method: 'openFileNavigatorFor', params: { label } }),
    onLaunchShellHere: () => client.send({ method: 'launchShellFor', params: { label } }),
    ...(workspaced && {
      onOpenDiffHere: () => client.send({ method: 'openDiffFor', params: { label } }),
    }),
    onOpenTranscript: () => client.send({ method: transcriptMethod, params: { label } }),
    onToggleCollapse: () => client.send({ method: 'toggleCollapse', params: {} }),
    onOpenAcpTranscript: (acpRef) => client.send({ method: 'openAcpTranscript', params: { acpRef } }),
    ...(recording !== undefined && {
      onOpenRecording: () => client.send({ method: 'openRecordingFor', params: { label } }),
    }),
  };
}
