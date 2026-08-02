import type { Tab, TabRuntime } from './types.js';

export function tabRuntime(tab: Tab): TabRuntime {
  tab.runtime ??= { busy: false, context: [], queue: [] };
  return tab.runtime;
}

export function runtimeFor(tabs: Tab[], label: string): TabRuntime | undefined {
  const tab = tabs.find((candidate) => candidate.label === label);
  return tab ? tabRuntime(tab) : undefined;
}
