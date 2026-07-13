import { parseMonitorCommand } from '../monitor/parsing.js';
import { formatTargets } from '../monitor/targets.js';
import { loadProfileMonitors } from '../profiles.js';
import type { Managers } from '../managers.js';

// Start each profile-level monitor (from the profile's `_monitors.json`) once its tabs are open,
// owned by the launch's issuing tab. Idempotent across relaunch: any existing same-owner monitor
// for the persona is stopped first, so re-launching a profile refreshes rather than errors. Each
// outcome (started, or the parse/start error) is pushed to `notes` for the launch report.
export function startProfileMonitors(
  profileName: string, managers: Managers, issuingLabel: string, notes: string[],
): void {
  for (const monitor of loadProfileMonitors(profileName)) {
    const parsed = parseMonitorCommand(`monitor ${monitor.persona} ${monitor.targets.join(' ')}`.trim());
    if ('error' in parsed) { notes.push(`Monitor "${monitor.persona}": ${parsed.error}`); continue; }
    if ('ask' in parsed) continue;
    managers.monitor.stop(issuingLabel, parsed.persona);
    const error = managers.monitor.start(issuingLabel, parsed.persona, parsed.targets);
    notes.push(error
      ? `Monitor "${monitor.persona}": ${error}`
      : `Monitoring ${formatTargets(parsed.targets)} (persona: ${parsed.persona}).`);
  }
}
