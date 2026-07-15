import type { MonitorSub } from './manager.js';
import type { Managers } from '../managers.js';
import { formatTargets } from './targets.js';
import { updateMonitorMeta } from './window.js';
import { recordContext } from './context.js';

// Account for a completed prompt's reply and refresh the reporting tab's metadata — shared by
// flush's and ask's `onEnd` handlers, both of which do this identically once an ACP reply finishes
// streaming.
export function recordReply(reg: MonitorSub, managers: Managers, reply: string): void {
  recordContext(reg, reply, 'response');
  if (!reg.inline) updateMonitorMeta(managers, reg.persona.name, formatTargets(reg.targets), reg.contextBytes);
}
