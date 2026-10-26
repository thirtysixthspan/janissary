import type { Managers } from '../../managers.js';
import type { RunscriptRow } from '../../plugins/scripts/shared.js';
import type { RunscriptRowView, RunscriptsView } from '../../protocol/runscripts.js';
import { catalogRunscripts, runscriptFilePath } from './runscript-files.js';

export function buildRunscriptRows(
  names: readonly string[],
  scheduleCount: (name: string) => number,
  isOpen: (name: string) => boolean,
): RunscriptRowView[] {
  return names.map((name) => ({ name, schedules: scheduleCount(name), open: isOpen(name) }));
}

// Use the catalog so the exclusion check is shared with runscript reads; successful roots are cached,
// so a refresh on each scheduler tick does not rerun Git.
export function readRunscriptRows(managers: Managers): RunscriptsView {
  const projectRoot = managers.tab.launchDir;
  let names: string[];
  try {
    names = catalogRunscripts(projectRoot);
  } catch {
    return { rows: [] };
  }
  const entries = managers.systemSchedule.list();
  const tabs = managers.tab.tabs;
  // The scripts plugin keeps its own copy of the row, since its shared contract can import nothing.
  // Annotating the rows with that copy and returning them as the host view makes the typecheck
  // compare the two in both directions.
  const rows: RunscriptRow[] = buildRunscriptRows(
    names,
    (name) => entries.filter((entry) => entry.script === name).length,
    (name) => {
      const file = runscriptFilePath(projectRoot, name);
      return tabs.some((tab) => tab.editor?.path === file);
    },
  );
  return { rows };
}
