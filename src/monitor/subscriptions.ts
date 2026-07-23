import { messageBus } from '../bus.js';
import type { Managers } from '../managers.js';
import { matchesTargets } from './targets.js';
import { SUGGESTION_PREFIX } from './suggestion.js';
import type { MonitorSub } from './manager.js';

export function subscribeMonitor(
  key: string,
  reg: MonitorSub,
  managers: Managers,
  onOwnerClosed: (owner: string) => void,
  onReportClosed: (owner: string, name: string) => void,
  onTargetClosed: (owner: string, name: string, label: string) => void,
): void {
  reg.subs.push(
    messageBus.on('transcript', 'entry:appended', (event) => {
      if (event.type !== 'entry:appended' || !matchesTargets(managers.tab.tabs, reg.targets, event.tabLabel)) return;
      if (event.entry.output.startsWith(SUGGESTION_PREFIX)) return;
      reg.buffer.push({ tabLabel: event.tabLabel, entry: event.entry });
    }),
    messageBus.on('transcript', 'tab:removed', (event) => {
      if (event.type !== 'tab:removed') return;
      if (event.tabLabel === reg.owner) {
        onOwnerClosed(reg.owner);
        return;
      }
      if (!reg.inline && event.tabLabel === reg.name) {
        onReportClosed(reg.owner, reg.name);
        return;
      }
      if (reg.targets.some((t) => t.kind === 'tab' && t.label === event.tabLabel)) {
        onTargetClosed(reg.owner, reg.name, event.tabLabel);
      }
    }),
  );
}
