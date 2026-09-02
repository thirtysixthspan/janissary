import { listProfiles, profileExists } from '../profiles.js';
import { parseProfileCommand } from './command.js';
import { loadProfile } from './file.js';
import { resolveAgentName } from '../agent/commands.js';
import { openProfileEntries } from './agent-opener.js';
import { reportValidation } from './validate.js';
import { saveProfile, formatSaveSummary } from './save.js';
import { notify } from '../notifications.js';
import type { Managers } from '../managers.js';
import { newAgentOp } from './new-agent.js';
import { placeAgent } from './place-agent.js';
import { messageBus } from '../bus.js';
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

    if (creator.remote) {
      if (!this.managers.remote.attach(resolved, label)) {
        notify(this.managers, 'manual', label, 'The remote workspace is no longer available.');
        return;
      }
      const workspace = this.managers.remote.workspaceOf(label);
      placeAgent(this.managers, {
        resolved, creator,
        cwd: workspace ?? cwd,
        offline: false,
        remote: creator.remote,
        busy: workspace === undefined,
      });
      if (workspace === undefined) this.waitForRemoteWorkspace(resolved, label);
      return;
    }

    if (creator.workspaceDir === undefined) {
      placeAgent(this.managers, { resolved, creator, cwd, offline: false });
      return;
    }

    this.managers.workspace.retain(creator.workspaceDir);
    placeAgent(this.managers, {
      resolved, creator, cwd: creator.workspaceDir, workspaceDir: creator.workspaceDir, offline: false,
    });
  }

  newAgentInWorkspace(label: string, workspaceDir: string): void {
    const creator = this.managers.tab.tabs.find((tab) => tab.label === label);
    if (!creator) return;
    const resolved = resolveAgentName('agent', this.managers.tab.allLabels());
    if (resolved === null) {
      notify(this.managers, 'manual', label, 'All agent names are in use.');
      return;
    }
    placeAgent(this.managers, {
      resolved, creator, cwd: workspaceDir, workspaceDir, offline: false,
    });
  }

  private waitForRemoteWorkspace(joinedLabel: string, sourceLabel: string): void {
    const ready = this.managers.remote.readyOf(sourceLabel);
    if (!ready) return;
    void ready.then((dir) => {
      if (this.managers.tab.findIndex(joinedLabel) === -1) return;
      this.managers.tab.setCwd(joinedLabel, dir);
      this.managers.tab.deleteBusy(joinedLabel);
      messageBus.emit('state', { type: 'dirty' });
    }, () => {
      const index = this.managers.tab.findIndex(joinedLabel);
      if (index !== -1) this.managers.tab.closeTab(index);
    });
  }

}
