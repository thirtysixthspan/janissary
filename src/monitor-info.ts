import type { ConnectionView } from './protocol.js';
import type { MonitorSub } from './monitor-manager.js';
import type { Persona } from './personas.js';
import type { AcpInfo } from './types.js';
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

// Rows for a tab's monitors (e.g. `monitor:security (opencode/…)`).
export function monitorConnections(monitors: Iterable<MonitorSub>, owner: string): ConnectionView[] {
  return [...monitors]
    .filter((reg) => reg.owner === owner)
    .map((reg) => {
      const info = reg.info ? ` (${formatConnection(reg.info)})` : '';
      return { text: `monitor:${reg.persona.name}${info}`, kind: 'acp' as const };
    });
}
