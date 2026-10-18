import type { Managers } from '../../managers.js';
import type { RunscriptRowView, RunscriptsView } from '../../protocol/runscripts.js';
import { listRunscriptNames, runscriptFilePath } from './runscript-files.js';

export function buildRunscriptRows(
  names: readonly string[],
  scheduleCount: (name: string) => number,
  isOpen: (name: string) => boolean,
): RunscriptRowView[] {
  return names.map((name) => ({ name, schedules: scheduleCount(name), open: isOpen(name) }));
}

// Names come from listRunscriptNames rather than catalogRunscripts. The catalog call runs Git
// commands on every call and writes the Git exclusion whenever its rules are missing, and the
// refresh calls this on every scheduler tick while a scripts tab is open.
export function readRunscriptRows(managers: Managers): RunscriptsView {
  const projectRoot = managers.tab.launchDir;
  let names: string[];
  try {
    names = listRunscriptNames(projectRoot);
  } catch {
    return { rows: [] };
  }
  const entries = managers.systemSchedule.list();
  const tabs = managers.tab.tabs;
  return {
    rows: buildRunscriptRows(
      names,
      (name) => entries.filter((entry) => entry.script === name).length,
      (name) => {
        const file = runscriptFilePath(projectRoot, name);
        return tabs.some((tab) => tab.editor?.path === file);
      },
    ),
  };
}
