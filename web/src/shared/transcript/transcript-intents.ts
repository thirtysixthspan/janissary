import type { JanusClient } from '../../ws';

// What a transcript line can ask the app to do. The renderers take these callbacks instead of the
// protocol client, so they stay presentational and the command strings below are the only place
// that knows how an intent reaches the server.
export type TranscriptIntents = {
  onOpenFile: (target: string) => void;
  onEditFile: (target: string) => void;
  onFocusTab: (label: string) => void;
  onPromoteToTerminal: () => void;
};

export function transcriptIntents(client: JanusClient): TranscriptIntents {
  return {
    onOpenFile: (target) => client.send({ method: 'command', params: { text: `open ${target}` } }),
    onEditFile: (target) => client.send({ method: 'command', params: { text: `edit ${target}` } }),
    onFocusTab: (label) => client.send({ method: 'focusTab', params: { label } }),
    onPromoteToTerminal: () => client.send({ method: 'promoteToTerminal', params: {} }),
  };
}
