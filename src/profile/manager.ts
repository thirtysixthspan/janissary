import { listProfiles, resolveProfile } from '../profiles.js';
import { parseProfileCommand } from './command.js';
import { launchProfileRunscript } from './runscript.js';
import type { Managers } from '../managers.js';
import { errorText } from '../error-text.js';

export class ProfileManager {
  constructor(private managers: Managers) {}

  private finish(action: Promise<void>, out: (text: string) => void): void {
    void action.catch((error: unknown) => {
      const reason = errorText(error);
      out(`Profile command failed: ${reason.replace(/[.\s]+$/, '')}.`);
    });
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
    const file = resolveProfile(parsed.name);
    if (!file) {
      out(`No profile named "${parsed.name}".`);
      return;
    }
    this.finish(launchProfileRunscript(this.managers, parsed.name, file, out), out);
  }

}
