import type { ConnectionView } from '../protocol.js';
import type { MonitorSub } from './live-monitors.js';
import { formatTargets } from './targets.js';

// Read-only projections of the live monitor registry: the `monitors` command listing
// and the connections-panel rows.

// Named by the runtime name, because that is what `unmonitor` and `monitor ask` address. The persona
// is shown beside it only when the two differ — for a monitor started by the `monitor` command they
// are the same word, and printing it twice would say nothing.
export function listMonitors(monitors: Iterable<MonitorSub>): string[] {
  return [...monitors].map((reg) => {
    const targets = formatTargets(reg.targets);
    const mode = reg.inline ? 'inline' : 'external';
    const named = reg.name === reg.persona.name ? reg.name : `${reg.name} (persona: ${reg.persona.name})`;
    return `${named}: ${targets} ← ${reg.owner} (${mode}, ${reg.delivered} suggestion${reg.delivered === 1 ? '' : 's'})`;
  });
}

// The runtime names of one tab's monitors — what `unmonitor` and `monitor ask` address, offered by
// completion. Owner-scoped, because both commands only reach monitors started from that tab.
export function monitorNames(monitors: Iterable<MonitorSub>, owner: string): string[] {
  return [...monitors].filter((reg) => reg.owner === owner).map((reg) => reg.name);
}

// Name-only handle rows for a tab's monitors (e.g. `monitor:security`). The model now belongs to
// the tab's core role row, so no provider/model suffix is shown here; the row and its `acpRef`
// still name the same runtime monitor so `connections close monitor:<name>` stops it.
export function monitorConnections(monitors: Iterable<MonitorSub>, owner: string): ConnectionView[] {
  return [...monitors]
    .filter((reg) => reg.owner === owner)
    .map((reg) => ({ text: `monitor:${reg.name}`, kind: 'acp' as const, acpRef: { scope: 'monitor' as const, name: reg.name } }));
}
