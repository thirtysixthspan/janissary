import { rmSync, mkdirSync } from 'node:fs';
import { profilePath } from '../profiles.js';
import { captureTab, newCaptureState } from './save-route.js';
import { writeMonitors, writeFiles, writeNotifications, writeSchedules, writeLayout } from './save-reserved.js';
import type { Managers } from '../managers.js';

export type SaveSummary = {
  agents: number;
  harnesses: number;
  monitors: number;
  dockedViews: number;
  skipped: string[];
  notes: string[];
};

// Captures the running session into `profiles/<name>/` — the inverse of `profile launch`. Every
// open tab, including the one the command was issued from, is routed to the right writer by its
// `view` (see save-route.ts); a name collision overwrites the target directory unconditionally,
// no prompt.
export async function saveProfile(name: string, managers: Managers): Promise<SaveSummary> {
  const dir = profilePath(name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });

  const state = newCaptureState();
  for (const tab of managers.tab.tabs) captureTab(dir, tab, managers, state);

  writeFiles(dir, state.filesEntries);
  writeNotifications(dir, state.notificationsEntries);
  writeSchedules(dir, state.schedulesEntries);
  writeMonitors(dir, managers);
  const notes: string[] = [];
  await writeLayout(dir, notes);

  return {
    agents: state.agents,
    harnesses: state.harnesses,
    monitors: managers.monitor.snapshot().length,
    dockedViews: state.dockedViews,
    skipped: state.skipped,
    notes,
  };
}

export function formatSaveSummary(name: string, summary: SaveSummary): string {
  const parts: string[] = [];
  if (summary.agents > 0) parts.push(`${summary.agents} agent${summary.agents === 1 ? '' : 's'}`);
  if (summary.harnesses > 0) parts.push(`${summary.harnesses} harness${summary.harnesses === 1 ? '' : 'es'}`);
  parts.push('layout');
  if (summary.monitors > 0) parts.push(`${summary.monitors} monitor${summary.monitors === 1 ? '' : 's'}`);
  if (summary.dockedViews > 0) parts.push(`${summary.dockedViews} docked tab${summary.dockedViews === 1 ? '' : 's'}`);

  const lines = [`Saved profile "${name}": ${parts.join(', ')}.`];
  if (summary.notes.length > 0) lines.push(summary.notes.join(' '));
  if (summary.skipped.length > 0) lines.push(`Skipped: ${summary.skipped.join(', ')}.`);
  return lines.join(' ');
}
