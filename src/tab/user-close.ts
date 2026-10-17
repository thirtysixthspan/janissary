import type { TabOperationsPort } from './operations.js';
import { closeTab } from './operations.js';
import { hideTab } from './visibility.js';
import { messageBus } from '../bus.js';

export function userCloseTab(port: TabOperationsPort, index: number): Promise<void> | undefined {
  const tab = port.tabs[index];
  if (!tab || tab.runtime?.closing) return;
  if (!tab.systemShell) return closeTab(port, index);
  if (hideTab(port, index)) messageBus.emit('state', { type: 'dirty' });
}
