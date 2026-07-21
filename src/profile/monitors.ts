import { parseMonitorCommand } from '../monitor/parsing.js';
import { formatTargets } from '../monitor/targets.js';
import type { Managers } from '../managers.js';
import type { ProfileMonitor } from '../types.js';

// Start each profile-level monitor (from the profile's `monitors` key) once its tabs are open,
// owned by the launch's issuing tab. Idempotent across relaunch: any existing same-owner monitor
// with the same `name` is stopped first, so re-launching a profile refreshes rather than errors.
// Each monitor's `name` — distinct from its persona (Decision 13) — is its runtime identity, so two
// monitors may share a persona yet coexist. Each outcome (started, or the parse/start error) is
// pushed to `notes` for the launch report.
export function startProfileMonitors(
  monitors: ProfileMonitor[], managers: Managers, issuingLabel: string, notes: string[],
): void {
  for (const monitor of monitors) {
    const parsed = parseMonitorCommand(`monitor ${monitor.persona} ${monitor.targets.join(' ')}`.trim());
    if ('error' in parsed) { notes.push(`Monitor "${monitor.name}": ${parsed.error}`); continue; }
    if ('ask' in parsed) continue;
    managers.monitor.stop(issuingLabel, monitor.name);
    const error = managers.monitor.start(issuingLabel, parsed.persona, parsed.targets, monitor.name);
    notes.push(error
      ? `Monitor "${monitor.name}": ${error}`
      : `Monitoring ${formatTargets(parsed.targets)} (persona: ${parsed.persona}).`);
  }
}
