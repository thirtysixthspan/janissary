import { listProfiles, profileExists } from '../profiles.js';
import { parseProfileCommand } from './command.js';
import { loadProfile } from './file.js';
import { openProfileEntries } from './agent-opener.js';
import { reportValidation } from './validate.js';
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
