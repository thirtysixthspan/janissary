import type { TabPluginState } from './api';

type TabStateEntry = {
  lifecycle: { active: boolean };
  values: Map<string, unknown>;
  listeners: Set<() => void>;
  access: TabPluginState;
};

// App owns this store for one client session. A plugin gets only the accessor for its own tab label;
// closed labels are invalidated before their next render can retain stale view state.
export class PluginTabStateStore {
  private readonly entries = new Map<string, TabStateEntry>();

  forTab(label: string): TabPluginState {
    const existing = this.entries.get(label);
    if (existing) return existing.access;

    const values = new Map<string, unknown>();
    const lifecycle = { active: true };
    const listeners = new Set<() => void>();
    const notify = () => {
      if (lifecycle.active) for (const listener of listeners) listener();
    };
    const access: TabPluginState = {
      get<Value>(key: string): Value | undefined {
        return lifecycle.active ? values.get(key) as Value | undefined : undefined;
      },
      set<Value>(key: string, value: Value): void {
        if (!lifecycle.active) return;
        values.set(key, value);
        notify();
      },
      delete(key: string): void {
        if (!lifecycle.active || !values.delete(key)) return;
        notify();
      },
      subscribe(listener: () => void): () => void {
        if (!lifecycle.active) return () => {};
        listeners.add(listener);
        return () => { listeners.delete(listener); };
      },
    };
    const entry: TabStateEntry = { lifecycle, values, listeners, access };
    this.entries.set(label, entry);
    return entry.access;
  }

  disposeClosedTabs(openLabels: ReadonlySet<string>): void {
    for (const [label, entry] of this.entries) {
      if (openLabels.has(label)) continue;
      entry.lifecycle.active = false;
      entry.values.clear();
      entry.listeners.clear();
      this.entries.delete(label);
    }
  }
}
