import type { Managers } from '../managers.js';

export function acpAvailable(label: string, managers: Managers): boolean {
  const tab = managers.tab?.byLabel?.(label);
  if (tab?.view !== 'plugin') return false;
  return managers.plugins?.declarations.find((entry) => entry.id === tab.plugin?.id)
    ?.capabilities.includes('promptAcp') === true;
}
