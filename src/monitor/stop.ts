import type { Managers } from '../managers.js';
import type { MonitorTarget } from '../types.js';
import type { MonitorSub } from './manager.js';
import { closeMonitorTab, updateMonitorMeta } from './window.js';
import { formatTargets, resolveTargetAliases } from './targets.js';

// Stop one monitor by name (or drop a single target from it). Returns false when no such monitor
// exists. Split out of MonitorManager to keep that file under the size limit.
export function stopMonitor(
  monitors: Map<string, MonitorSub>,
  managers: Managers,
  owner: string,
  name: string,
  target?: MonitorTarget,
): boolean {
  const key = `${owner}:${name}`;
  const reg = monitors.get(key);
  if (!reg) return false;
  const resolvedTarget = target ? resolveTargetAliases(managers.tab.tabs, [target])[0] : undefined;
  if (resolvedTarget && !reg.inline) {
    reg.targets = reg.targets.filter((t) => JSON.stringify(t) !== JSON.stringify(resolvedTarget));
    if (reg.targets.length > 0) {
      updateMonitorMeta(managers, name, formatTargets(reg.targets), reg.contextBytes);
      return true;
    }
  }
  for (const sub of reg.subs) sub.unsubscribe();
  clearInterval(reg.timer);
  reg.session.kill();
  monitors.delete(key);
  if (!reg.inline) closeIfUnfed(monitors, managers, name);
  return true;
}

// Close a monitor's reporting tab if no live monitor still feeds it (another owner may run a
// same-named monitor and keep it open).
export function closeIfUnfed(monitors: Map<string, MonitorSub>, managers: Managers, name: string): void {
  const stillFed = [...monitors.values()].some((r) => !r.inline && r.name === name);
  if (!stillFed) closeMonitorTab(managers, name);
}
