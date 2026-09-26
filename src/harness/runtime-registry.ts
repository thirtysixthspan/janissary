import { messageBus, type Subscription } from '../bus.js';
import type { HarnessRuntime } from './runtime.js';

type Entry = { label: string; runtime: HarnessRuntime };

// The harness and ssh tabs' per-PTY runtimes, keyed by PTY id, each recorded beside the label of the
// tab that owns it. A runtime is released on whichever comes first: its PTY exiting, its tab
// closing, or another runtime being installed under the same id. The tab-close release is the one
// a remote harness depends on: detaching disconnects the channel before the tab closes, so the
// PTY's `kill` never reaches the far side and no exit event ever arrives. The label is recorded
// here rather than read off the tab at close time because a provisioning tab has no PTY id yet and
// the close walk is in the middle of removing the tab record.
export class HarnessRuntimes {
  private entries = new Map<string, Entry>();
  private subscription: Subscription;

  constructor() {
    this.subscription = messageBus.on('pty', 'exit', (event) => {
      if (event.type !== 'exit') return;
      this.release(event.id);
    });
  }

  get(id: string): HarnessRuntime | undefined {
    return this.entries.get(id)?.runtime;
  }

  // A reattach adopts the PTY id the far side already knows, so an id can come back while an
  // earlier runtime is still stored under it. That runtime is released first rather than
  // overwritten, or its recorder would stay subscribed to the reused id and keep writing.
  install(id: string, label: string, runtime: HarnessRuntime): void {
    this.release(id);
    this.entries.set(id, { label, runtime });
  }

  closeTab(label: string): void {
    for (const [id, entry] of this.entries) {
      if (entry.label === label) this.release(id);
    }
  }

  dispose(): void {
    this.subscription.unsubscribe();
    for (const id of this.entries.keys()) this.release(id);
  }

  private release(id: string): void {
    this.entries.get(id)?.runtime.dispose();
    this.entries.delete(id);
  }
}
