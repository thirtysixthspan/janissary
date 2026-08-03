import { rmSync, writeFileSync } from 'node:fs';
import { profilePath } from '../profiles.js';
import { captureTab, newCaptureState } from './save-route.js';
import { buildMonitors, buildLayout } from './save-reserved.js';
import { requestTreeSelections } from '../file-navigator/selection-request.js';
import type { Managers } from '../managers.js';
import type { ProfileFile } from './types.js';

export type SaveSummary = {
  agents: number;
  harnesses: number;
  editors: number;
  plugins: number;
  markdown: number;
  pages: number;
  ssh: number;
  fileNavigators: number;
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

  // Every navigator's cursor/anchor/selection lives in the web client, so ask for it before
  // routing tabs — the same shape as awaiting `buildLayout`'s window-bounds read below. A save
  // with no client attached simply gets an empty map and writes the trees without those keys.
  const selections = await requestTreeSelections();
  const state = newCaptureState();
  for (const tab of managers.tab.tabs) captureTab(tab, managers, state, selections);

  const notes: string[] = [];
  const layout = await buildLayout(notes);
  const monitors = buildMonitors(managers);

  const root: ProfileFile = {};
  if (state.tabEntries.length > 0) root.tabs = state.tabEntries;
  if (monitors.length > 0) root.monitors = monitors;
  root.layout = layout;
  writeFileSync(file, JSON.stringify(root, null, 2));

  return {
    agents: state.agents,
    harnesses: state.harnesses,
    editors: state.editors,
    plugins: state.plugins,
    markdown: state.markdown,
    pages: state.pages,
    ssh: state.ssh,
    fileNavigators: state.fileNavigators,
    monitors: monitors.length,
    dockedViews: state.dockedViews,
    skipped: state.skipped,
    notes,
  };
}

// `N <label>`, pluralized by appending `s` — the shape every count in the report shares except
// "harnesses", which supplies its own plural.
function countPart(count: number, label: string): string[] {
  return count > 0 ? [`${count} ${label}${count === 1 ? '' : 's'}`] : [];
}

export function formatSaveSummary(name: string, summary: SaveSummary): string {
  const harnesses = summary.harnesses > 0
    ? [`${summary.harnesses} harness${summary.harnesses === 1 ? '' : 'es'}`]
    : [];
  const parts = [
    ...countPart(summary.agents, 'agent'),
    ...harnesses,
    ...countPart(summary.editors, 'editor tab'),
    ...countPart(summary.plugins, 'plugin tab'),
    ...countPart(summary.markdown, 'markdown tab'),
    ...countPart(summary.pages, 'page tab'),
    ...countPart(summary.ssh, 'ssh tab'),
    ...countPart(summary.fileNavigators, 'file navigator'),
    'layout',
    ...countPart(summary.monitors, 'monitor'),
    ...countPart(summary.dockedViews, 'docked tab'),
  ];

  const lines = [`Saved profile "${name}": ${parts.join(', ')}.`];
  if (summary.notes.length > 0) lines.push(summary.notes.join(' '));
  if (summary.skipped.length > 0) lines.push(`Skipped: ${summary.skipped.join(', ')}.`);
  return lines.join(' ');
}
