import path from 'node:path';
import { messageBus, type Subscription } from '../../bus.js';
import { notify } from '../../notifications/index.js';
import { ShellTranscriptWriter } from './writer.js';
import type { Managers } from '../../managers.js';

// How long shutdown waits for the writers to write their final rows and close their files. A stalled
// disk never closes its stream, and a near-limit unparsed backlog takes xterm many time slices to
// parse, so quitting waits at most this long rather than hanging on either.
export const SHELL_TRANSCRIPT_SHUTDOWN_WAIT_MS = 1000;

type Entry = { label: string; writer: ShellTranscriptWriter };
type ClosingWriter = { path: string | undefined; finishing: Promise<void> };

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
  private closing = new Map<ShellTranscriptWriter, ClosingWriter>();
  private tabs = new Map<string, TabFailureState>();
  private released = new WeakSet<ShellTranscriptWriter>();
  private subscription: Subscription;

  constructor(private readonly managers: Managers) {
    this.subscription = messageBus.on('pty', 'exit', (event) => {
      if (event.type === 'exit') this.finishEntry(event.id);
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
      if (!tab) return;
      tab.transcript = path;
      messageBus.emit('state', { type: 'dirty' });
    });
    this.entries.set(ptyId, { label, writer });
  }

  // Whether a writer still holds `filePath` open for appending, so the editor can refuse a save that
  // would replace it and leave every later row in the orphaned file. A deliberate exception to the
  // manager exposing no path lookup: the tab's remembered transcript path outlives its writer, so it
  // cannot say whether the file is still being written.
  isWriting(filePath: string): boolean {
    const target = path.resolve(filePath);
    for (const { writer } of this.entries.values()) {
      const writing = writer.writingPath();
      if (writing !== undefined && path.resolve(writing) === target) return true;
    }
    for (const writer of this.closing.values()) {
      if (writer.path !== undefined && path.resolve(writer.path) === target) return true;
    }
    return false;
  }

  closeTab(label: string): void {
    for (const [id, entry] of this.entries) {
      if (entry.label === label) this.release(id);
    }
    this.tabs.delete(label);
  }

  dispose(): void | Promise<void> {
    this.subscription.unsubscribe();
    for (const id of this.entries.keys()) this.finishEntry(id);
    const writers = [...this.closing.values()].map(({ finishing }) => finishing);
    if (writers.length === 0) return;
    const finished = Promise.allSettled(writers);
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
    this.finishEntry(id);
  }

  private finishEntry(id: string): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    this.entries.delete(id);
    const writer = entry.writer;
    const closing = { path: writer.writingPath(), finishing: writer.dispose() };
    this.closing.set(writer, closing);
    void closing.finishing.then(() => {
      if (this.closing.get(writer) === closing) this.closing.delete(writer);
    });
  }
}
