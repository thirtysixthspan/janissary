import type { HarnessAutoApprover } from './auto-approve.js';
import type { HarnessRecorder } from './recorder.js';
import type { HarnessScreenReader } from './screen.js';
import type { HarnessTranscriptTailer } from './transcript/tailer.js';
import type { E2EBrowserHandle } from '../browser/e2e-server.js';

// Owns every observer attached to one harness PTY, and every other per-PTY resource the tab
// acquired at spawn. Keeping them together makes exit and manager shutdown use the same cleanup path
// as new per-PTY resources are added — the browser below is the first member that is not an
// observer, and it is here for exactly that reason: closing a `-b` tab kills its PTY, which fires
// the exit event, which disposes this, which stops the guard, kills the child, and removes the
// browser workspace. No new label-keyed map and no new line in `src/tab/cleanup.ts`.
export class HarnessRuntime {
  private disposed = false;

  constructor(
    readonly reader: HarnessScreenReader,
    readonly recorder?: HarnessRecorder,
    readonly tailer?: HarnessTranscriptTailer,
    readonly autoApprover?: HarnessAutoApprover,
    readonly browser?: E2EBrowserHandle,
  ) {}

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.reader.dispose();
    this.recorder?.dispose();
    this.tailer?.dispose();
    this.browser?.close();
  }
}
