import type { MonitorSub } from './monitor-manager.js';
import type { Managers } from './managers.js';
import { formatTargets } from './monitor-targets.js';
import { updateMonitorMeta } from './monitor-window.js';

// Account for a completed prompt's reply bytes and refresh the reporting tab's metadata — shared
// by flush's and ask's `onEnd` handlers, both of which do this identically once an ACP reply
// finishes streaming.
export function recordReply(reg: MonitorSub, managers: Managers, reply: string): void {
  reg.contextBytes += Buffer.byteLength(reply, 'utf8');
  if (!reg.inline) updateMonitorMeta(managers, reg.persona.name, formatTargets(reg.targets), reg.contextBytes);
}
