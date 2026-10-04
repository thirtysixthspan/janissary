import type { RpcCall } from '@shared/protocol';

// What a transcript line can ask the app to do. The renderers take these callbacks instead of the
// protocol client, so they stay presentational and the command strings below are the only place
// that knows how an intent reaches the server.
export type TranscriptIntents = {
  onOpenFile: (target: string) => void;
  onEditFile: (target: string) => void;
  onFocusTab: (label: string) => void;
  onPromoteToTerminal: () => void;
};

export function transcriptIntents(send: (call: RpcCall) => void): TranscriptIntents {
  return {
    onOpenFile: (target) => send({ method: 'command', params: { text: `open ${target}` } }),
    onEditFile: (target) => send({ method: 'command', params: { text: `edit ${target}` } }),
    onFocusTab: (label) => send({ method: 'focusTab', params: { label } }),
    onPromoteToTerminal: () => send({ method: 'promoteToTerminal', params: {} }),
  };
}
