import {
  writeAgentEntry, writeEditorEntry, writeHarnessEntry, writeImageEntry, writeMarkdownEntry,
  writePageEntry, writeSshEntry,
} from './save-entries.js';
import type { Managers } from '../managers.js';
import type { ProfileTabFile, Tab } from '../types.js';

// Per-tab routing for `profile save`, split out of save.ts to keep its cognitive complexity down.
// Each tab produces one element of the profile's single `tabs` array, appended in tab-strip order,
// plus a bump of the per-type counter the save report reads. Monitor reporting tabs are
// deliberately a no-op here (captured via the monitor manager's snapshot instead), so they never
// land in `skipped`.
export type CaptureState = {
  agents: number;
  harnesses: number;
  editors: number;
  images: number;
  markdown: number;
  pages: number;
  ssh: number;
  dockedViews: number;
  skipped: string[];
  tabEntries: ProfileTabFile[];
};

export function newCaptureState(): CaptureState {
  return {
    agents: 0, harnesses: 0, editors: 0, images: 0, markdown: 0, pages: 0, ssh: 0,
    dockedViews: 0, skipped: [], tabEntries: [],
  };
}

type CaptureCount = 'agents' | 'harnesses' | 'editors' | 'images' | 'markdown' | 'pages' | 'ssh';

// Append an entry and bump its counter, when the writer produced one at all.
function push(state: CaptureState, entry: ProfileTabFile | undefined, count: CaptureCount): void {
  if (!entry) return;
  state.tabEntries.push(entry);
  state[count] += 1;
}

export function captureTab(tab: Tab, managers: Managers, state: CaptureState): void {
  switch (tab.view) {
    case undefined:
    case 'agent': {
      if (tab === managers.tab.tabs[0] && tab.label === 'janus') return;
      state.tabEntries.push(writeAgentEntry(tab, managers));
      state.agents += 1;
      return;
    }
    case 'harness': {
      // An ssh tab reuses the harness view (see types.ts's HarnessView comment) but is its own
      // profile entry type, keyed by the destination it reconnects to.
      if (tab.harness?.name === 'ssh') { push(state, writeSshEntry(tab, managers), 'ssh'); return; }
      push(state, writeHarnessEntry(tab, managers), 'harnesses');
      return;
    }
    case 'editor': {
      const entry = writeEditorEntry(tab, managers);
      if (entry) push(state, entry, 'editors');
      else state.skipped.push(tab.label);
      return;
    }
    case 'image': {
      push(state, writeImageEntry(tab, managers), 'images');
      return;
    }
    case 'markdown': {
      push(state, writeMarkdownEntry(tab, managers), 'markdown');
      return;
    }
    case 'page': {
      push(state, writePageEntry(tab, managers), 'pages');
      return;
    }
    case 'files': {
      if (tab.dock) { state.tabEntries.push({ type: 'files', dock: tab.dock, path: tab.files?.absoluteRoot }); state.dockedViews += 1; }
      else state.skipped.push(tab.label);
      return;
    }
    case 'notifications': {
      if (tab.dock) { state.tabEntries.push({ type: 'notifications', dock: tab.dock }); state.dockedViews += 1; }
      return;
    }
    case 'schedules': {
      if (tab.dock) { state.tabEntries.push({ type: 'schedules', dock: tab.dock }); state.dockedViews += 1; }
      return;
    }
    case 'monitor': {
      return;
    }
    default: {
      state.skipped.push(tab.label);
    }
  }
}
