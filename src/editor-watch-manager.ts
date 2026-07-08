import { watch, statSync, type FSWatcher } from 'node:fs';
import { messageBus } from './bus.js';
import type { Managers } from './managers.js';

const DEBOUNCE_MS = 100;

type WatchState = {
  filePath: string;
  watcher: FSWatcher;
  baselineMtimeMs: number;
  debounce?: ReturnType<typeof setTimeout>;
};

// Watches an open editor tab's underlying file for changes made by other processes, keyed by tab
// label. `markSaved` moves the baseline mtime forward before the write's own `fs.watch` event
// arrives, so the app's own saves never appear as an external change.
export class EditorWatchManager {
  private tabs = new Map<string, WatchState>();

  constructor(private managers: Managers) {}

  watch(label: string, filePath: string): void {
    this.unwatch(label);
    let baselineMtimeMs: number;
    try { baselineMtimeMs = statSync(filePath).mtimeMs; } catch { return; }
    try {
      const watcher = watch(filePath, () => this.scheduleCheck(label));
      this.tabs.set(label, { filePath, watcher, baselineMtimeMs });
    } catch {
      // Exotic filesystems, fd limits, races — the editor still works, just without live reload.
    }
  }

  // Move the baseline forward after the app's own write, so the resulting `fs.watch` event isn't
  // mistaken for an external change.
  markSaved(label: string, mtimeMs: number): void {
    const state = this.tabs.get(label);
    if (state) state.baselineMtimeMs = mtimeMs;
  }

  closeTab(label: string): void {
    this.unwatch(label);
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
    const tab = this.managers.tab.tabs.find((t) => t.label === label);
    if (!tab?.editor) return;
    tab.editor = { ...tab.editor, mtimeMs };
    messageBus.emit('state', { type: 'dirty' });
  }
}
