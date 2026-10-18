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
