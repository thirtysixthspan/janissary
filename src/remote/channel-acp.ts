import type { RemoteFrame } from './protocol.js';

export type AcpSessionListener = {
  onReady: () => void;
  onChunk: (text: string) => void;
  onEnd: (stopReason: string) => void;
  onError: (message: string, fatal: boolean) => void;
};

export function dispatchAcp(sessions: Map<string, AcpSessionListener>, frame: RemoteFrame): boolean {
  switch (frame.type) {
  case 'acp-ready': { sessions.get(frame.id)?.onReady(); return true; }
  case 'acp-chunk': { sessions.get(frame.id)?.onChunk(frame.text); return true; }
  case 'acp-end': { sessions.get(frame.id)?.onEnd(frame.stopReason); return true; }
  case 'acp-error': { sessions.get(frame.id)?.onError(frame.message, frame.fatal); return true; }
  default: { return false; }
  }
}
