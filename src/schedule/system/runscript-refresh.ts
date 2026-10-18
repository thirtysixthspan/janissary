import { messageBus } from '../../bus.js';
import type { Subscription } from '../../bus.js';
import type { Managers } from '../../managers.js';
import type { Tab } from '../../tab/types.js';
import type { RunscriptRowView } from '../../protocol/runscripts.js';
import { readRunscriptRows } from './runscript-rows.js';

export type RunscriptRefresh = { tick(): void; dispose(): void };

type Listens = (pluginId: string) => boolean;

function admitted(tabs: readonly Tab[], listens: Listens): boolean {
  return tabs.some((tab) => tab.plugin !== undefined && listens(tab.plugin.id));
}

function sameRows(left: readonly RunscriptRowView[], right: readonly RunscriptRowView[]): boolean {
  return left.length === right.length && left.every((row, index) => {
    const other = right[index];
    return row.name === other.name && row.schedules === other.schedules && row.open === other.open;
  });
}

export function createRunscriptRefresh(
  managers: Managers,
  listens: Listens,
  publish: () => void = () => messageBus.emit('runscripts', { type: 'changed' }),
): RunscriptRefresh {
  let published: RunscriptRowView[] = [];
  let disposed = false;
  return {
    tick() {
      if (disposed) return;
      if (!admitted(managers.tab.tabs, listens)) {
        published = [];
        return;
      }
      const { rows } = readRunscriptRows(managers);
      if (sameRows(published, rows)) return;
      published = rows;
      publish();
    },
    dispose() {
      disposed = true;
    },
  };
}

export function subscribeRunscriptRefresh(managers: Managers, listens: Listens): Subscription {
  const refresh = createRunscriptRefresh(managers, listens);
  const subscription = messageBus.on('schedules', 'tick', () => refresh.tick());
  return {
    unsubscribe: () => {
      subscription.unsubscribe();
      refresh.dispose();
    },
  };
}
