import type { RemoteAcpActivityKind, RemoteFrame } from '../protocol-frames.js';

type AcpTurnFrame = Extract<RemoteFrame, { type: 'acp-turn' }>;
type AcpToolRequestFrame = Extract<RemoteFrame, { type: 'acp-tool-request' }>;
type AcpToolStepFrame = Extract<RemoteFrame, { type: 'acp-tool-step' }>;
type AcpRunEndReason = Extract<RemoteFrame, { type: 'acp-run-end' }>['reason'];

export type AcpSessionListener = {
  onReady: (sandboxed: boolean) => void;
  onChunk: (text: string) => void;
  onTurn: (frame: AcpTurnFrame) => void;
  onToolRequest: (frame: AcpToolRequestFrame) => void;
  onToolStep: (frame: AcpToolStepFrame) => void;
  onRunEnd: (reason: AcpRunEndReason) => void;
  onActivity: (kind: RemoteAcpActivityKind, text: string) => void;
  onClosed: (released: boolean) => void;
  onTransportLost?: () => void;
  onError: (message: string, fatal: boolean) => void;
};

export function dispatchAcp(sessions: Map<string, AcpSessionListener>, frame: RemoteFrame): boolean {
  switch (frame.type) {
  case 'acp-ready': { sessions.get(frame.id)?.onReady(frame.sandboxed); return true; }
  case 'acp-chunk': { sessions.get(frame.id)?.onChunk(frame.text); return true; }
  case 'acp-turn': { sessions.get(frame.id)?.onTurn(frame); return true; }
  case 'acp-tool-request': { sessions.get(frame.id)?.onToolRequest(frame); return true; }
  case 'acp-tool-step': { sessions.get(frame.id)?.onToolStep(frame); return true; }
  case 'acp-run-end': { sessions.get(frame.id)?.onRunEnd(frame.reason); return true; }
  case 'acp-activity': { sessions.get(frame.id)?.onActivity(frame.kind, frame.text); return true; }
  case 'acp-closed': { sessions.get(frame.id)?.onClosed(frame.released); return true; }
  case 'acp-error': { sessions.get(frame.id)?.onError(frame.message, frame.fatal); return true; }
  default: { return false; }
  }
}
