import type { Managers } from '../managers.js';
import { queueRunscriptLines } from '../commands/execute.js';
import { readRunscriptFile } from '../schedule/system/runscript-files.js';

export async function launchProfileRunscript(
  managers: Managers,
  name: string,
  file: string,
  out: (text: string) => void,
): Promise<void> {
  let runscript;
  try {
    runscript = readRunscriptFile(file);
  } catch {
    out(`Could not read runscript for profile "${name}".`);
    return;
  }
  if (!runscript.exists) {
    out(`No profile named "${name}".`);
    return;
  }
  await queueRunscriptLines(managers, runscript.lines);
}
