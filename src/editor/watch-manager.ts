import { watch, statSync, type FSWatcher } from 'node:fs';
import { messageBus } from '../bus.js';
import type { Managers } from '../managers.js';
import path from 'node:path';

const DEBOUNCE_MS = 100;

type WatchState = {
  filePath: string;
  watcher: FSWatcher;
  baselineMtimeMs: number;
  debounce?: ReturnType<typeof setTimeout>;
};

// Watches the directory containing an open editor file, keyed by tab label, so observation stays
// attached to the pathname when another process atomically replaces the file itself.
export class EditorWatchManager {
  private tabs = new Map<string, WatchState>();

  constructor(private managers: Managers) {}

  watch(label: string, filePath: string): void {
    this.unwatch(label);
    let baselineMtimeMs: number;
    try { baselineMtimeMs = statSync(filePath).mtimeMs; } catch { return; }
    try {
      const watcher = watch(path.dirname(filePath), (_event, filename) => {
        if (filename && filename !== path.basename(filePath)) return;
        this.scheduleCheck(label);
      });
      const state: WatchState = { filePath, watcher, baselineMtimeMs };
      this.tabs.set(label, state);
      watcher.on('error', () => this.handleWatcherError(label, state));
    } catch {
      // Exotic filesystems, fd limits, races — the editor still works, just without live reload.
    }
  }

  // Atomic saves replace the watched file. Observe its replacement with the saved baseline so
  // subsequent external edits are detected without reporting the save itself.
  markSaved(label: string, mtimeMs: number): void {
    const state = this.tabs.get(label);
    if (!state) return;
    this.watch(label, state.filePath);
    const replacement = this.tabs.get(label);
    if (replacement) replacement.baselineMtimeMs = mtimeMs;
  }

  closeTab(label: string): void {
    this.unwatch(label);
  }

  // Re-checks a label's file immediately and re-arms its watcher, rather than waiting for an
  // `fs.watch` event that a git-driven replace (e.g. a resync pull) may never deliver — confirmed
  // by experiment, a single-file `fs.watch` survives one such replace but silently misses the next.
  refresh(label: string): void {
    const state = this.tabs.get(label);
    if (!state) return;
    this.check(label);
    this.watch(label, state.filePath);
  }

  dispose(): void {
    for (const label of this.tabs.keys()) this.unwatch(label);
  }

  private unwatch(label: string): void {
    const state = this.tabs.get(label);
    if (!state) return;
    if (state.debounce) clearTimeout(state.debounce);
    try { state.watcher.close(); } catch { /* already gone */ }
    this.tabs.delete(label);
  }

  private handleWatcherError(label: string, state: WatchState): void {
    if (this.tabs.get(label) !== state) return;
    if (state.debounce) clearTimeout(state.debounce);
    try { state.watcher.close(); } catch { /* already gone */ }
    this.tabs.delete(label);
  }

  private scheduleCheck(label: string): void {
    const state = this.tabs.get(label);
    if (!state) return;
    if (state.debounce) clearTimeout(state.debounce);
    state.debounce = setTimeout(() => this.check(label), DEBOUNCE_MS);
  }

  private check(label: string): void {
    const state = this.tabs.get(label);
    if (!state) return;
    let mtimeMs: number;
    try { mtimeMs = statSync(state.filePath).mtimeMs; } catch { return; }
    if (mtimeMs === state.baselineMtimeMs) return;
    state.baselineMtimeMs = mtimeMs;
    const tab = this.managers.tab.byLabel(label);
    if (!tab?.editor) return;
    tab.editor = { ...tab.editor, mtimeMs };
    messageBus.emit('state', { type: 'dirty' });
  }
}
