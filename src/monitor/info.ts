import type { ConnectionView } from '../protocol.js';
import type { MonitorSub } from './manager.js';
import type { Persona } from '../personas.js';
import type { AcpInfo } from '../acp/types.js';
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

// Joins provider and model into a single "provider/model" label, dropping whichever is absent.
export function formatConnection(info: AcpInfo): string {
  return [info.provider, info.model].filter(Boolean).join('/');
}

// A persona's body opens with a single declarative sentence (e.g. "You are a security
// monitor."); take up to its first period as a concise one-sentence summary.
export function personaSummary(persona: Persona): string {
  const period = persona.body.indexOf('.');
  return period === -1 ? persona.body.trim() : persona.body.slice(0, period + 1);
}

// Rows for a tab's monitors (e.g. `monitor:security (opencode/…)`). The text names the same runtime
// name the `acpRef` beside it carries, so the row and the thing it addresses cannot disagree.
export function monitorConnections(monitors: Iterable<MonitorSub>, owner: string): ConnectionView[] {
  return [...monitors]
    .filter((reg) => reg.owner === owner)
    .map((reg) => {
      const info = reg.info ? ` (${formatConnection(reg.info)})` : '';
      return { text: `monitor:${reg.name}${info}`, kind: 'acp' as const, acpRef: { scope: 'monitor' as const, name: reg.name } };
    });
}
