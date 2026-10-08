import { listProfiles, profileExists } from '../profiles.js';
import { parseProfileCommand } from './command.js';
import { loadProfile } from './file.js';
import { openProfileEntries } from './agent-opener.js';
import { reportValidation } from './validate.js';
import { saveProfile, formatSaveSummary } from './save/index.js';
import type { Managers } from '../managers.js';
import { errorText } from '../error-text.js';

export class ProfileManager {
  private saveQueue: Promise<void> = Promise.resolve();

  constructor(private managers: Managers) {}

  private finish(action: Promise<void>, out: (text: string) => void): void {
    void action.catch((error: unknown) => {
      const reason = errorText(error);
      out(`Profile command failed: ${reason.replace(/[.\s]+$/, '')}.`);
    });
  }

  private async save(name: string, out: (text: string) => void): Promise<void> {
    const summary = await saveProfile(name, this.managers);
    out(formatSaveSummary(name, summary));
  }

  private queueSave(name: string, out: (text: string) => void): void {
    const action = this.runQueuedSave(this.saveQueue, name, out);
    this.saveQueue = this.ignoreFailure(action);
    this.finish(action, out);
  }

  private async runQueuedSave(
    previous: Promise<void>, name: string, out: (text: string) => void,
  ): Promise<void> {
    try { await previous; } catch { /* the next save still runs */ }
    await this.save(name, out);
  }

  private async ignoreFailure(action: Promise<void>): Promise<void> {
    try { await action; } catch { /* failures are reported by finish */ }
  }

  run(command: string, label: string): void {
    const parsed = parseProfileCommand(command);
    const out = (text: string) => this.managers.tab.append(label, { input: command, output: text });
    if ('error' in parsed) { out(parsed.error); return; }
    if (parsed.action === 'list') {
      const names = listProfiles();
      out(names.length > 0 ? names.join('\n') : 'No profiles.');
      return;
    }
    if (parsed.action === 'save') {
      this.queueSave(parsed.name, out);
      return;
    }
    if (parsed.action === 'validate') {
      out(reportValidation(parsed.name));
      return;
    }
    if (!profileExists(parsed.name)) {
      out(`No profile named "${parsed.name}".`);
      return;
    }
    const loaded = loadProfile(parsed.name);
    if ('error' in loaded) {
      out(`Profile "${parsed.name}" is malformed. Run \`profile validate ${parsed.name}\` for details.`);
      return;
    }
    const tabCount = loaded.entries.length + loaded.editors.length + loaded.views.length
      + loaded.files.length + loaded.notifications.length;
    if (tabCount === 0) {
      out(`Profile "${parsed.name}" has no tabs.`);
      return;
    }

    this.finish(openProfileEntries(loaded, this.managers, parsed.name, label, out), out);
  }

}
