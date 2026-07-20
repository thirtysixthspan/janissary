import { writeAgentEntry, writeHarnessEntry } from './save-entries.js';
import type { Managers } from '../managers.js';
import type { ProfileFilesEntry, ProfileNotificationsEntry, ProfileSchedulesEntry, Tab } from '../types.js';

// Per-tab routing for `profile save`, split out of save.ts to keep its cognitive complexity down.
// Monitor reporting tabs are deliberately a no-op here (captured via the monitor manager's
// snapshot instead), so they never land in `skipped`.
export type CaptureState = {
  agents: number;
  harnesses: number;
  dockedViews: number;
  skipped: string[];
  filesEntries: ProfileFilesEntry[];
  notificationsEntries: ProfileNotificationsEntry[];
  schedulesEntries: ProfileSchedulesEntry[];
};

export function newCaptureState(): CaptureState {
  return {
    agents: 0, harnesses: 0, dockedViews: 0, skipped: [],
    filesEntries: [], notificationsEntries: [], schedulesEntries: [],
  };
}

export function captureTab(dir: string, tab: Tab, managers: Managers, state: CaptureState): void {
  switch (tab.view) {
    case undefined:
    case 'agent': {
      writeAgentEntry(dir, tab, managers);
      state.agents += 1;
      return;
    }
    case 'harness': {
      // An ssh tab reuses the harness view (see types.ts's HarnessView comment) but has no
      // profile-entry form of its own.
      if (tab.harness?.name === 'ssh') { state.skipped.push(tab.label); return; }
      writeHarnessEntry(dir, tab, managers);
      state.harnesses += 1;
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
