import type { HarnessAutoApprover } from './auto-approve.js';
import type { HarnessRecorder } from './recorder.js';
import type { HarnessScreenReader } from './screen.js';
import type { HarnessTranscriptTailer } from './transcript/tailer.js';

// Owns every observer attached to one harness PTY. Keeping the observers together makes exit and
// manager shutdown use the same cleanup path as new per-PTY resources are added.
export class HarnessRuntime {
  private disposed = false;

  constructor(
    readonly reader: HarnessScreenReader,
    readonly recorder?: HarnessRecorder,
    readonly tailer?: HarnessTranscriptTailer,
    readonly autoApprover?: HarnessAutoApprover,
  ) {}

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.reader.dispose();
    this.recorder?.dispose();
    this.tailer?.dispose();
  }
}
