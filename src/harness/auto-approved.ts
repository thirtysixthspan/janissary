import { messageBus } from '../bus.js';
import type { Managers } from '../managers.js';

// Auto-approve has cleared a permission prompt in the tab: lights the metadata row's auto-approve
// flag green for the rest of the tab's life. The notification is the caller's job — the local
// approver and the remote gate-event translation each already send their own.
export function reportAutoApproved(managers: Managers, label: string): void {
  const tab = managers.tab.harnessTab(label);
  if (!tab || tab.harness.autoApproved) return;
  tab.harness.autoApproved = true;
  messageBus.emit('state', { type: 'dirty' });
}
