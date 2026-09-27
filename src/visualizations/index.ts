import type { Tab } from '../tab/types.js';
import type { VisualizationSummaryView, VisualizationWindowView } from '../protocol.js';
import type { VisualizationRecord, VisualizationStore } from './store.js';
import { summaryOf, windowOf } from './view.js';

const PLUGIN_ID = 'visualizations';

// Which records this manager knows, and which of them have a tab on screen. It exists apart from the
// manager for two reasons, and both are about what reaches the wire.
//
// A window carries the table, and every tab's payload is re-broadcast on essentially every mutation, so
// a table kept for a tab the user closed would be a cost paid by every keystroke in every tab from then
// on. Only the open set is projected, and the open set is read off the tabs themselves on every pass
// rather than tracked here, so it cannot drift from them.
//
// The other is the disk fallback. A record is read from the store the first time it is asked for and
// held from then on, which is what lets a visualization saved weeks ago be opened without the manager
// having parsed the whole tree at startup.
export class VisualizationIndex {
  private readonly records = new Map<string, VisualizationRecord>();
  private readonly deleted = new Set<string>();

  constructor(private readonly store: VisualizationStore) {}

  find(id: string): VisualizationRecord | undefined {
    const existing = this.records.get(id);
    if (existing) return existing;
    const stored = this.store.read(id);
    if (!stored) return undefined;
    this.records.set(id, stored);
    return stored;
  }

  remember(record: VisualizationRecord): void {
    this.records.set(record.id, record);
  }

  // A record deleted while its tab is still open stays here, so that tab keeps something to render and
  // something to say why it is inert. It leaves when the tab does. `live` is what every mutation goes
  // through instead of `find`, so a deleted record cannot be written back to disk by a late action.
  markDeleted(id: string): void {
    this.deleted.add(id);
  }

  live(id: string): VisualizationRecord | undefined {
    if (this.deleted.has(id)) return undefined;
    return this.find(id);
  }

  isDeleted(id: string): boolean {
    return this.deleted.has(id);
  }

  ids(): IterableIterator<string> {
    return this.records.keys();
  }

  // Drops the in-memory copy of a record whose tab has closed, whether it was deleted or merely read.
  // Nothing can reach it any more, and keeping it would keep its table out of the next broadcast.
  release(id: string): void {
    this.records.delete(id);
    this.deleted.delete(id);
  }

  summaries(): VisualizationSummaryView[] {
    const summaries = new Map(this.store.list().map((entry) => [entry.id, entry]));
    for (const record of this.records.values()) {
      if (!this.deleted.has(record.id)) summaries.set(record.id, summaryOf(record));
    }
    return [...summaries.values()].toSorted((a, b) => b.updatedAt - a.updatedAt);
  }

  // The window payloads for the records with a tab on screen, which is the whole of what the plugin is
  // shown for them. Beside `summaries` because it is the same projection of the same records. It takes
  // the open set rather than tracking it, for the reason the class comment gives, and a deleted record
  // still projects — its tab is open and has to be told something.
  windows(open: readonly string[], isBusy: (id: string) => boolean): VisualizationWindowView[] {
    return open.flatMap((id) => {
      const record = this.find(id);
      return record ? [windowOf(record, isBusy(id), this.deleted.has(id))] : [];
    });
  }

  // The instance keys of this plugin's open tabs, list tab excluded: the index is a singleton the host
  // renders from a payload of its own, and it has no record behind it to project.
  openIds(tabs: readonly Tab[]): string[] {
    return tabs
      .filter((tab) => tab.plugin?.id === PLUGIN_ID && tab.plugin.instanceKey !== PLUGIN_ID)
      .map((tab) => tab.plugin?.instanceKey ?? '')
      .filter((id) => id !== '');
  }
}
