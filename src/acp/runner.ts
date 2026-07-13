import { messageBus } from '../bus.js';
import type { Tab } from '../types.js';
import type { Managers } from '../managers.js';

export function makeUpdateRunning(
  label: string,
  managers: Managers,
): (output: string, running: boolean) => void {
  return (output: string, running: boolean) => {
    const t = managers.tab.tabs.find((x: Tab) => x.label === label);
    if (t) {
      const log = [...t.log];
      const index = log.findLastIndex((e: { running?: boolean }) => e.running);
      if (index !== -1) log[index] = { ...log[index], output, running };
      t.log = log;
      if (!running) managers.tab.persist(managers.tab.buildAgentState(t));
    }
    if (!running && output && t) messageBus.emit('transcript', { type: 'entry:appended', tabLabel: label, entry: { input: '', output }, tab: t });
    messageBus.emit('state', { type: 'dirty' });
  };
}
