import { messageBus, type Subscription } from '../../bus.js';
import { notify } from '../../notifications/index.js';
import { ShellTranscriptWriter } from './writer.js';
import type { Managers } from '../../managers.js';

// How long shutdown waits for the writers to write their final rows and close their files. A stalled
// disk never closes its stream, and a near-limit unparsed backlog takes xterm many time slices to
// parse, so quitting waits at most this long rather than hanging on either.
export const SHELL_TRANSCRIPT_SHUTDOWN_WAIT_MS = 1000;

type Entry = { label: string; writer: ShellTranscriptWriter };

// Whether an open tab has already been told its transcript failed. Each writer keeps the state of the
// tab it was installed under, and closing the tab discards that state.
type TabFailureState = { notified: boolean };

// The shell tabs' text-transcript writers, one per recorded PTY, each kept beside the label of the
// tab that owns it. A writer is released on whichever comes first: its PTY exiting, its tab closing,
// another writer being installed under the same id, or shutdown — which, alone of these, waits for
// the writers' final rows to reach disk, since the process exits right after it.
//
// A failure is reported once per tab: one tab can hold several writers (a factory that starts more
// than one terminal, or a reinstall under a reattached id), and one notice says all there is to say.
// The once-per-tab state belongs to the open tab rather than to its label, so a writer of a tab that
// has since closed reports nothing, whether its shell exited before the close or the close released
// it: its finishing path can still fail, but the tab is gone, and a later tab reusing the label starts
// with fresh state. A writer released by a reinstall reports nothing either, since its tab speaks
// through the newer writer.
export class ShellTranscriptManager {
  private entries = new Map<string, Entry>();
  private tabs = new Map<string, TabFailureState>();
  private released = new WeakSet<ShellTranscriptWriter>();
  private subscription: Subscription;

  constructor(private readonly managers: Managers) {
    // The writer's own exit listener runs its finishing path, so the entry is only dropped here. The
    // drop is synchronous, unlike the harness runtimes' release, because no transcript writes an exit
    // status that a release mid-dispatch could cut off.
    this.subscription = messageBus.on('pty', 'exit', (event) => {
      if (event.type === 'exit') this.entries.delete(event.id);
    });
  }

  // A reattached remote sibling can be recorded again under the id the far side already knows, so the
  // writer held under it is released first, or every row would be written into two files.
  install(ptyId: string, label: string): void {
    this.release(ptyId);
    const state = this.tabState(label);
    const { cols, rows } = this.managers.pty.spawnDimensions();
    const writer = new ShellTranscriptWriter(ptyId, label, cols, rows, () => {
      if (!this.released.has(writer) && this.tabs.get(label) === state) this.reportFailure(state, label);
    }, (path) => {
      const tab = this.managers.tab.byLabel(label);
      if (tab) tab.transcript = path;
    });
    this.entries.set(ptyId, { label, writer });
  }

  closeTab(label: string): void {
    for (const [id, entry] of this.entries) {
      if (entry.label === label) this.release(id);
    }
    this.tabs.delete(label);
  }

  dispose(): void | Promise<void> {
    this.subscription.unsubscribe();
    const writers = [...this.entries.values()].map((entry) => entry.writer);
    this.entries.clear();
    if (writers.length === 0) return;
    const finished = Promise.allSettled(writers.map((writer) => writer.dispose()));
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, SHELL_TRANSCRIPT_SHUTDOWN_WAIT_MS);
      void finished.then(() => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  private tabState(label: string): TabFailureState {
    let state = this.tabs.get(label);
    if (!state) {
      state = { notified: false };
      this.tabs.set(label, state);
    }
    return state;
  }

  private reportFailure(state: TabFailureState, label: string): void {
    if (state.notified) return;
    state.notified = true;
    notify(this.managers, 'shell-transcript-failed', label);
  }

  private release(id: string): void {
    const writer = this.entries.get(id)?.writer;
    if (!writer) return;
    this.released.add(writer);
    void writer.dispose();
    this.entries.delete(id);
  }
}
