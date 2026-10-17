import type { Tab } from '../tab/types.js';

export function authorizeRestartIntent(tab: Tab | undefined): void {
  if (tab?.systemShell && tab.plugin?.id === 'shell') return;
  throw new Error('Only a managed system shell can restart its terminal');
}
