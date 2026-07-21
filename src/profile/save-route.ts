import { writeAgentEntry, writeHarnessEntry } from './save-entries.js';
import type { Managers } from '../managers.js';
import type {
  ProfileAgentFile, ProfileFilesEntry, ProfileHarnessFile, ProfileNotificationsEntry,
  ProfileSchedulesEntry, Tab,
} from '../types.js';

// Per-tab routing for `profile save`, split out of save.ts to keep its cognitive complexity down.
// Each tab produces a value pushed onto the matching accumulator; `saveProfile` assembles them into
// one root object. Monitor reporting tabs are deliberately a no-op here (captured via the monitor
// manager's snapshot instead), so they never land in `skipped`.
export type CaptureState = {
  agents: number;
  harnesses: number;
  dockedViews: number;
  skipped: string[];
  agentEntries: ProfileAgentFile[];
  harnessEntries: ProfileHarnessFile[];
  filesEntries: ProfileFilesEntry[];
  notificationsEntries: ProfileNotificationsEntry[];
  schedulesEntries: ProfileSchedulesEntry[];
};

export function newCaptureState(): CaptureState {
  return {
    agents: 0, harnesses: 0, dockedViews: 0, skipped: [],
    agentEntries: [], harnessEntries: [],
    filesEntries: [], notificationsEntries: [], schedulesEntries: [],
  };
}

export function captureTab(tab: Tab, managers: Managers, state: CaptureState): void {
  switch (tab.view) {
    case undefined:
    case 'agent': {
      if (tab === managers.tab.tabs[0] && tab.label === 'janus') return;
      state.agentEntries.push(writeAgentEntry(tab, managers));
      state.agents += 1;
      return;
    }
    case 'harness': {
      // An ssh tab reuses the harness view (see types.ts's HarnessView comment) but has no
      // profile-entry form of its own.
      if (tab.harness?.name === 'ssh') { state.skipped.push(tab.label); return; }
      const entry = writeHarnessEntry(tab, managers);
      if (entry) { state.harnessEntries.push(entry); state.harnesses += 1; }
      return;
    }
    case 'files': {
      if (tab.dock) { state.filesEntries.push({ dock: tab.dock, path: tab.files?.absoluteRoot }); state.dockedViews += 1; }
      else state.skipped.push(tab.label);
      return;
    }
    case 'notifications': {
      if (tab.dock) { state.notificationsEntries.push({ dock: tab.dock }); state.dockedViews += 1; }
      return;
    }
    case 'schedules': {
      if (tab.dock) { state.schedulesEntries.push({ dock: tab.dock }); state.dockedViews += 1; }
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
