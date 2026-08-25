import type { TranscriptSource } from '../harness/transcript/source.js';

// The local half of a remote tab's transcript. `harness transcript` is the one observer whose
// source is not the streamed terminal bytes but the harness binary's own session record — which
// lives in the *remote's* dot directory. `TranscriptSource` is a two-method contract, so the remote
// runs the ordinary `createTranscriptSource` and pushes each poll's blocks, and this adapter simply
// drains what has arrived. `HarnessTranscriptTailer` is unchanged and cannot tell the difference.
export type RemoteTranscriptSource = TranscriptSource & {
  push: (blocks: string[]) => void;
};

export function createRemoteTranscriptSource(): RemoteTranscriptSource {
  let pending: string[] = [];
  let seen = false;
  return {
    push: (blocks) => {
      if (blocks.length === 0) return;
      seen = true;
      pending = [...pending, ...blocks];
    },
    poll: () => {
      const drained = pending;
      pending = [];
      return drained;
    },
    resolved: () => seen,
  };
}
