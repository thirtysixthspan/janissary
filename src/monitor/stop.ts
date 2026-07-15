import type { Managers } from '../managers.js';
import type { MonitorTarget } from '../types.js';
import type { MonitorSub } from './manager.js';
import { closeMonitorTab, updateMonitorMeta } from './window.js';
import { formatTargets, resolveTargetAliases } from './targets.js';

// Stop one persona's monitor (or drop a single target from it). Returns false when no such
// monitor exists. Split out of MonitorManager to keep that file under the size limit.
export function stopMonitor(
  monitors: Map<string, MonitorSub>,
  managers: Managers,
  owner: string,
  personaName: string,
  target?: MonitorTarget,
): boolean {
  const key = `${owner}:${personaName}`;
  const reg = monitors.get(key);
  if (!reg) return false;
  const resolvedTarget = target ? resolveTargetAliases(managers.tab.tabs, [target])[0] : undefined;
  if (resolvedTarget && !reg.inline) {
    reg.targets = reg.targets.filter((t) => JSON.stringify(t) !== JSON.stringify(resolvedTarget));
    if (reg.targets.length > 0) {
      updateMonitorMeta(managers, personaName, formatTargets(reg.targets), reg.contextBytes);
      return true;
    }
  }
  for (const sub of reg.subs) sub.unsubscribe();
  clearInterval(reg.timer);
  reg.session.kill();
  monitors.delete(key);
  if (!reg.inline) closeIfUnfed(monitors, managers, personaName);
  return true;
}

// Close a persona's reporting tab if no live monitor still feeds it (another owner may run
// the same persona and keep it open).
export function closeIfUnfed(monitors: Map<string, MonitorSub>, managers: Managers, personaName: string): void {
  const stillFed = [...monitors.values()].some((r) => !r.inline && r.persona.name === personaName);
  if (!stillFed) closeMonitorTab(managers, personaName);
}
