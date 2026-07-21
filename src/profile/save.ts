import { rmSync, writeFileSync } from 'node:fs';
import { profilePath } from '../profiles.js';
import { captureTab, newCaptureState } from './save-route.js';
import { buildMonitors, buildLayout } from './save-reserved.js';
import type { Managers } from '../managers.js';
import type { ProfileFile } from '../types.js';

export type SaveSummary = {
  agents: number;
  harnesses: number;
  monitors: number;
  dockedViews: number;
  skipped: string[];
  notes: string[];
};

// Captures the running session into a single `profiles/<name>.json` — the inverse of `profile
// launch`. Every open tab, including the one the command was issued from, is routed to the right
// accumulator by its `view` (see save-route.ts) and assembled into one root object. A name collision
// overwrites unconditionally; a stale same-named directory from the old multi-file format is removed.
export async function saveProfile(name: string, managers: Managers): Promise<SaveSummary> {
  const file = profilePath(name);
  // Overwrite any existing single file, and defensively remove a stale same-named directory left
  // over from the old multi-file format (`profiles/<name>/`).
  rmSync(file, { recursive: true, force: true });
  rmSync(file.replace(/\.json$/, ''), { recursive: true, force: true });

  const state = newCaptureState();
  for (const tab of managers.tab.tabs) captureTab(tab, managers, state);

  const notes: string[] = [];
  const layout = await buildLayout(notes);
  const monitors = buildMonitors(managers);

  const root: ProfileFile = {};
  if (state.agentEntries.length > 0) root.agents = state.agentEntries;
  if (state.harnessEntries.length > 0) root.harnesses = state.harnessEntries;
  if (monitors.length > 0) root.monitors = monitors;
  if (state.filesEntries.length > 0) root.files = state.filesEntries;
  if (state.notificationsEntries.length > 0) root.notifications = state.notificationsEntries;
  if (state.schedulesEntries.length > 0) root.schedules = state.schedulesEntries;
  root.layout = layout;
  writeFileSync(file, JSON.stringify(root, null, 2));

  return {
    agents: state.agents,
    harnesses: state.harnesses,
    monitors: monitors.length,
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
