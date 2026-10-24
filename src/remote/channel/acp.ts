import type { RemoteAcpActivityKind, RemoteFrame } from '../protocol-frames.js';

export type AcpSessionListener = {
  onReady: (sandboxed: boolean) => void;
  onChunk: (text: string) => void;
  onEnd: (stopReason: string) => void;
  onActivity: (kind: RemoteAcpActivityKind, text: string) => void;
  onClosed: (released: boolean) => void;
  onTransportLost?: () => void;
  onError: (message: string, fatal: boolean) => void;
};

export function dispatchAcp(sessions: Map<string, AcpSessionListener>, frame: RemoteFrame): boolean {
  switch (frame.type) {
  case 'acp-ready': { sessions.get(frame.id)?.onReady(frame.sandboxed); return true; }
  case 'acp-chunk': { sessions.get(frame.id)?.onChunk(frame.text); return true; }
  case 'acp-end': { sessions.get(frame.id)?.onEnd(frame.stopReason); return true; }
  case 'acp-activity': { sessions.get(frame.id)?.onActivity(frame.kind, frame.text); return true; }
  case 'acp-closed': { sessions.get(frame.id)?.onClosed(frame.released); return true; }
  case 'acp-error': { sessions.get(frame.id)?.onError(frame.message, frame.fatal); return true; }
  default: { return false; }
  }
}
