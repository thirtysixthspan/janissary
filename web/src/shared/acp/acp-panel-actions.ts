import type { RpcCall } from '@shared/protocol';
import { ptyActions, type PtyActions } from '../terminal/pty-actions';
import { transcriptIntents, type TranscriptIntents } from '../transcript/transcript-intents';

type AcpPanelTransport = {
  send: (call: RpcCall) => void;
  attachPty: (id: string, onData: (data: string) => void) => () => void;
};

export type AcpPanelActions = {
  reset: () => void;
  toggleCollapse: () => void;
  intents: TranscriptIntents;
  ptyActions: PtyActions;
};

export function acpPanelActions(transport: AcpPanelTransport, label: string): AcpPanelActions {
  const send = (call: RpcCall) => transport.send(call.method === 'command'
    ? { ...call, params: { ...call.params, tab: label } }
    : call);

  return {
    reset: () => transport.send({ method: 'resetAcp', params: { tab: label } }),
    toggleCollapse: () => transport.send({ method: 'toggleCollapse', params: { tab: label } }),
    intents: transcriptIntents(send),
    ptyActions: ptyActions(transport),
  };
}
