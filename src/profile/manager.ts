import { listProfiles, profileExists } from '../profiles.js';
import { parseProfileCommand } from './command.js';
import { loadProfile } from './file.js';
import { resolveAgentName } from '../agent/commands.js';
import { openProfileEntries } from './agent-opener.js';
import { reportValidation } from './validate.js';
import { saveProfile, formatSaveSummary } from './save.js';
import { notify } from '../notifications.js';
import { sandboxNotice } from '../sandbox/index.js';
import { wireProvisioning, PROVISION_FAILURE_CLOSE_DELAY_MS } from '../workspace/provision-wire.js';
import { messageBus } from '../bus.js';
import type { Managers } from '../managers.js';
import { newAgentOp } from './new-agent.js';
import { placeAgent } from './place-agent.js';

export class ProfileManager {
  private saveQueue: Promise<void> = Promise.resolve();

  constructor(private managers: Managers) {}

  private finish(action: Promise<void>, out: (text: string) => void): void {
    void action.catch((error: unknown) => {
      const reason = error instanceof Error ? error.message : String(error);
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

  newAgent(command: string): void {
    newAgentOp(this.managers, command);
  }

  // Launch a bare, auto-named agent tab rooted at the named source tab's cwd, joining its group —
  // the ➕ metadata-row button. A no-op for an unknown label; every message (pool exhaustion, a
  // workspace-clone error or its ready confirmation) reaches the notifications feed rather than a
  // transcript, since the source tab may be a harness with no transcript to print into.
  newAgentAt(label: string): void {
    const creator = this.managers.tab.tabs.find((t) => t.label === label);
    if (!creator) return;
    const resolved = resolveAgentName('agent', this.managers.tab.allLabels());
    if (resolved === null) { notify(this.managers, 'manual', label, 'All agent names are in use.'); return; }
    const cwd = this.managers.tab.cwdOf(label) ?? process.cwd();

    if (creator.workspaceDir === undefined) {
      placeAgent(this.managers, { resolved, creator, cwd, offline: false });
      return;
    }

    // Creator tab is workspaced — the new agent inherits its own cloned workspace, following the
    // same clone/busy/provisioning flow as `agent --workspace` (see `newAgentOp`).
    const result = this.managers.workspace.create(resolved);
    if ('error' in result) { notify(this.managers, 'manual', label, result.error); return; }
    placeAgent(this.managers, {
      resolved, creator, cwd: result.dir, workspaceDir: result.dir, offline: false, busy: true,
    });
    wireProvisioning(
      resolved,
      result.ready,
      (l) => this.managers.tab.tabs.some((t) => t.label === l),
      () => {
        this.managers.tab.deleteBusy(resolved);
        messageBus.emit('state', { type: 'dirty' });
        const notice = sandboxNotice();
        notify(this.managers, 'manual', label, `Agent "${resolved}" ready. (workspace: ${this.managers.tab.shorten(result.dir)})`);
        if (notice) notify(this.managers, 'manual', label, notice);
      },
      (message) => {
        notify(this.managers, 'manual', label, `Failed to create workspace for "${resolved}": ${message}`);
        setTimeout(() => {
          const index = this.managers.tab.findIndex(resolved);
          if (index !== -1) this.managers.tab.closeTab(index);
        }, PROVISION_FAILURE_CLOSE_DELAY_MS);
      },
    );
  }

}
