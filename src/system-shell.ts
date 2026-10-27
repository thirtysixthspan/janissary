import type { Managers } from './managers.js';
import type { Tab } from './tab/types.js';
import { notifySystemShellStartFailure } from './schedule/system/notices.js';
import { hideTab } from './tab/visibility.js';
import { messageBus } from './bus.js';
import { SHELL_COMMAND, SHELL_PLUGIN_ID, shellTabPtyId } from './shell/shell-tab-terminal.js';

const SYSTEM_LABEL = 'system';
const SYSTEM_ORIGIN = { label: SYSTEM_LABEL, command: SHELL_COMMAND, launch: true } as const;

export type SystemShellEnsureResult =
  | { status: 'ok'; tab: Tab }
  | { status: 'failed'; reason: unknown };

export function liveShellPtyId(tab: Tab | undefined, managers: Managers): string | undefined {
  if (!tab || tab.remote !== undefined) return;
  const ptyId = shellTabPtyId(tab, managers);
  if (ptyId === undefined) return;
  if (managers.pty.terminalIdFor(tab.label) !== ptyId || !managers.pty.isRunningFor(ptyId, [tab.label])) return;
  return ptyId;
}

export class SystemShellManager {
  private ensurePromise?: Promise<SystemShellEnsureResult>;
  private disposed = false;

  constructor(private readonly managers: Managers) {}

  ensure(): Promise<SystemShellEnsureResult> {
    if (this.disposed) return Promise.resolve({ status: 'failed', reason: 'system shell manager is disposed' });
    if (this.ensurePromise) return this.ensurePromise;
    const attempt = this.runEnsure();
    this.ensurePromise = attempt;
    return attempt;
  }

  dispose(): void | Promise<void> {
    this.disposed = true;
    if (this.ensurePromise) return this.awaitEnsure();
  }

  async handlePtyExit(ptyId: string): Promise<void> {
    if (this.disposed) return;
    const tab = this.managers.tab.tabs.find((candidate) => candidate.systemShell === true);
    if (!tab || tab.remote || tab.runtime?.closing || tab.view !== 'plugin') return;
    if (shellTabPtyId(tab, this.managers) !== ptyId) return;
    if (tab.runtime?.serverPtyExitId === ptyId) return;

    tab.runtime ??= { busy: false, context: [], queue: [] };
    tab.runtime.serverPtyExitId = ptyId;
    hideTab(this.managers.tab, this.managers.tab.tabs.indexOf(tab));
    this.managers.schedule.closeTab(tab.label);
    messageBus.emit('state', { type: 'dirty' });
    await this.ensure();
  }

  private async runEnsure(): Promise<SystemShellEnsureResult> {
    try {
      return await this.ensureShell();
    } catch (error) {
      return this.fail(error);
    } finally {
      this.ensurePromise = undefined;
    }
  }

  private async awaitEnsure(): Promise<void> {
    await this.ensurePromise;
  }

  private async ensureShell(): Promise<SystemShellEnsureResult> {
    const existing = this.managers.tab.tabs.find((tab) => tab.systemShell === true);
    if (existing) {
      if (liveShellPtyId(existing, this.managers)) return { status: 'ok', tab: existing };
      const ptyId = shellTabPtyId(existing, this.managers);
      if (existing.runtime?.serverPtyExitId && ptyId === existing.runtime.serverPtyExitId && !this.disposed) {
        await this.managers.plugins.intent(existing.label, 'restart-terminal', { ptyId });
        const replacement = liveShellPtyId(existing, this.managers);
        if (replacement) return { status: 'ok', tab: existing };
      }
      return this.fail('the existing system shell has no valid live local terminal');
    }
    if (this.managers.tab.byLabel(SYSTEM_LABEL)) return this.fail('the shell plugin opened no valid system shell');

    const before = new Set(this.managers.tab.tabs);
    const outcome = await this.managers.plugins.runCommandResult(SHELL_PLUGIN_ID, SHELL_COMMAND, SYSTEM_ORIGIN);
    const opened = this.managers.tab.tabs.find((tab) => !before.has(tab) && tab.label === SYSTEM_LABEL);
    if (outcome.status !== 'ok') {
      if (opened) await this.closeAttempt(opened);
      return this.fail(outcome.status === 'rejected' ? outcome.reason : outcome.error);
    }
    if (!opened || !liveShellPtyId(opened, this.managers)) {
      if (opened) await this.closeAttempt(opened);
      return this.fail('the shell plugin opened no valid system shell');
    }

    opened.systemShell = true;
    this.managers.tab.userCloseTab(this.managers.tab.findIndex(opened.label));
    return { status: 'ok', tab: opened };
  }

  private async closeAttempt(tab: Tab): Promise<void> {
    const closing = this.managers.tab.closeTab(this.managers.tab.tabs.indexOf(tab));
    if (closing) await closing;
  }

  private fail(reason: unknown): SystemShellEnsureResult {
    notifySystemShellStartFailure(this.managers, reason);
    return { status: 'failed', reason };
  }
}
