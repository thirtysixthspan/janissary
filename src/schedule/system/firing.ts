import type { Managers } from '../../managers.js';
import { computeNextRun } from '../time.js';
import { readRunscript } from './runscript-files.js';
import { notifySystemScheduleRun } from './notices.js';
import type { SystemScheduleEntry } from './types.js';

export async function fireSystemBatch(
  managers: Managers,
  entry: SystemScheduleEntry,
  now: number,
): Promise<{ lines: string[]; entry: SystemScheduleEntry | undefined; missing: boolean } | undefined> {
  let runscript;
  try {
    runscript = readRunscript(managers.tab.launchDir, entry.script);
  } catch (error) {
    process.stderr.write(`System schedule ${entry.id}: ${error instanceof Error ? error.message : String(error)}\n`);
    return;
  }
  if (!runscript.exists) {
    return { lines: [], entry: advance(entry, now), missing: true };
  }
  const shell = await managers.systemShell.ensure();
  if (shell.status !== 'ok') return;
  return { lines: runscript.lines, entry: advance(entry, now), missing: false };
}

export function appendSystemBatch(managers: Managers, entry: SystemScheduleEntry, lines: string[]): void {
  managers.tab.enqueueSystemScheduleBatch('system', lines, entry.key);
  notifySystemScheduleRun(managers, entry.id, entry.script);
}

export function advance(entry: SystemScheduleEntry, now: number): SystemScheduleEntry | undefined {
  return entry.recurring ? { ...entry, nextRun: computeNextRun(entry, new Date(now)) } : undefined;
}
