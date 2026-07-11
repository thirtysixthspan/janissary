import type { ConnectionView } from './protocol.js';
import type { MonitorSub } from './monitor-manager.js';
import { formatTargets } from './monitor-targets.js';

// Read-only projections of the live monitor registry: the `monitors` command listing
// and the connections-panel rows.

export function listMonitors(monitors: Iterable<MonitorSub>): string[] {
  return [...monitors].map((reg) => {
    const targets = formatTargets(reg.targets);
    const mode = reg.inline ? 'inline' : 'external';
    return `${reg.persona.name}: ${targets} ← ${reg.owner} (${mode}, ${reg.delivered} suggestion${reg.delivered === 1 ? '' : 's'})`;
  });
}

// Rows for a tab's monitors (e.g. `monitor:security (opencode/…)`).
export function monitorConnections(monitors: Iterable<MonitorSub>, owner: string): ConnectionView[] {
  return [...monitors]
    .filter((reg) => reg.owner === owner)
    .map((reg) => {
      const info = reg.info ? ` (${[reg.info.provider, reg.info.model].filter(Boolean).join('/')})` : '';
      return { text: `monitor:${reg.persona.name}${info}`, kind: 'acp' as const };
    });
}
