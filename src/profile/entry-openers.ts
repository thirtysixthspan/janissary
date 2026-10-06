import { HARNESS_COMMANDS } from '../harness/index.js';
import { describeAutoApproveHarnesses, supportsHarnessAutoApprove } from '../harness/auto-approve.js';
import { isKnownModel } from '../harness/models.js';
import { buildHarnessSchedule } from './harness-schedule.js';
import { expandUserPath } from '../paths.js';
import type { Managers } from '../managers.js';
import type { ProfileHarnessEntry } from './types.js';

// Validate and open a harness entry. Returns an error to report and skip on, or undefined once
// the tab (and its schedule) is set up.
export function openHarnessEntry(
  entry: ProfileHarnessEntry, managers: Managers, group: number, groupColor: string,
  issuing: { label: string; cwd: string }, notes: string[],
): string | undefined {
  if (HARNESS_COMMANDS[entry.tool] === undefined) return `unknown tool "${entry.tool}"`;
  if (entry.model && !isKnownModel(entry.tool, entry.model)) {
    return `Unknown model "${entry.model}" for harness "${entry.tool}" — add it to harness-models.json.`;
  }
  // Mirror `parseHarnessCommand`: -y is supported only for harnesses with a gate detector. Report and skip rather than open unsafely.
  if (entry.autoApprove && !supportsHarnessAutoApprove(entry.tool)) {
    return `autoApprove (-y) is only supported for the ${describeAutoApproveHarnesses()} harnesses`;
  }
  const cwd = entry.cwd ? expandUserPath(entry.cwd, { root: managers.tab.launchDir }) : issuing.cwd;
  const withCwd: ProfileHarnessEntry = { ...entry, cwd };
  const error = managers.harness.openFromProfile(withCwd, entry.name, group, groupColor, issuing.label);
  if (error) return error;
  const schedule = buildHarnessSchedule(entry, (message) => { notes.push(message); });
  if (schedule.length > 0) managers.schedule.set(entry.name, schedule);
  return undefined;
}
