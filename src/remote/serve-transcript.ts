import { createTranscriptSource } from '../harness/transcript/sources.js';
import type { TranscriptSource } from '../harness/transcript/source.js';
import type { ServerFrame } from './protocol-frames.js';

// How often the harness's own session record is re-read and pushed, matching the local tailer's
// cadence (`src/harness/transcript/tailer.ts`).
const TRANSCRIPT_POLL_MS = 2000;

// The harness's session record lives in this machine's dot directory, so the ordinary source builder
// runs here and each poll's blocks are pushed to the local tailer. One harness at a time: a spawn
// naming a harness already followed is a no-op, and one before the workspace is provisioned has no
// dot directory to read. The poll stops when the session does, whether it was shut down or attached
// away from.
export class RemoteTranscriptFollow {
  private source: TranscriptSource | undefined;
  private timer: NodeJS.Timeout | undefined;

  constructor(private emit: (frame: ServerFrame) => void) {}

  follow(harness: string, dir: string | undefined): void {
    if (this.source || dir === undefined) return;
    const source = createTranscriptSource(harness, dir, Date.now());
    if (!source) return;
    this.source = source;
    this.timer = setInterval(() => {
      const blocks = source.poll();
      if (blocks.length > 0) this.emit({ type: 'transcript', blocks });
    }, TRANSCRIPT_POLL_MS);
    this.timer.unref();
  }

  dispose(): void {
    if (this.timer) clearInterval(this.timer);
  }
}
