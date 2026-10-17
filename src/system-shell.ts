import type { Managers } from './managers.js';
import type { Tab } from './tab/types.js';
import { notifySystemShellStartFailure } from './schedule/system/notices.js';

const SYSTEM_LABEL = 'system';
const SHELL_PLUGIN = 'shell';
const SHELL_COMMAND = 'shell --no-workspace';
const SYSTEM_ORIGIN = { label: SYSTEM_LABEL, command: SHELL_COMMAND, launch: true } as const;

export type SystemShellEnsureResult =
  | { status: 'ok'; tab: Tab }
  | { status: 'failed'; reason: unknown };

export function liveShellPtyId(tab: Tab | undefined, managers: Managers): string | undefined {
  if (!tab || tab.remote !== undefined || tab.plugin?.id !== SHELL_PLUGIN) return;
  const payload = tab.plugin.payload;
  if (!managers.plugins.isPayload(SHELL_PLUGIN, payload)) return;
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload) || !('ptyId' in payload)) return;
  const ptyId = payload.ptyId;
  if (typeof ptyId !== 'string') return;
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
      return liveShellPtyId(existing, this.managers)
        ? { status: 'ok', tab: existing }
        : this.fail('the existing system shell has no valid live local terminal');
    }
    if (this.managers.tab.byLabel(SYSTEM_LABEL)) return this.fail('the shell plugin opened no valid system shell');

    const before = new Set(this.managers.tab.tabs);
    const outcome = await this.managers.plugins.runCommandResult(SHELL_PLUGIN, SHELL_COMMAND, SYSTEM_ORIGIN);
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
