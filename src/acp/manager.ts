import { AcpSessionManager } from './session-manager.js';
import { appendAcp } from './response.js';
import { messageBus } from '../bus.js';
import { errorText } from '../error-text.js';
import { tabRuntime } from '../tab/runtime.js';
import type { AcpPromptResult } from './types.js';
import type { AcpPendingPrompt, PromptResultOptions } from './prompt-state.js';
import type { TabRuntime } from '../tab/types.js';
import type { SubagentDelivery } from '../subagent/messages.js';
import { deliverSubagentMessage, scheduleSubagentDrain } from './subagent-delivery.js';
import { prepareCorePromptRecord, runCorePrompt } from './run-prompt.js';
import type { Managers } from '../managers.js';
import type { RoleEntry } from '../plugins/roles/shared.js';
import {
  attemptOrder, fallbackNotice, finalAttemptResult, noRoleModels, readRoleSettings,
  type AcpRoleSettings, type Attempt,
} from './ask-role.js';
import { acpRoleRuntime, existingAcpRoleRuntime } from './role-state.js';
import { cancelAcpPrompt } from './cancel-prompt.js';
import { DEFAULT_ACP_ROLE, type AcpRole } from './role.js';
import { startCoreSession } from './manager-start.js';

const STILL_CONNECTING = 'ACP: the remote session is still connecting.';

export class AcpManager extends AcpSessionManager {
  constructor(
    managers: Managers,
    private readonly roleSettings: (root: string, role: AcpRole) => AcpRoleSettings = readRoleSettings,
  ) {
    super(managers);
  }

  start(
    label: string, request?: { withoutTools?: true }, role: string = DEFAULT_ACP_ROLE,
  ): { model?: string; error?: string; session?: string } {
    return startCoreSession({
      managers: this.managers,
      roleSettings: this.roleSettings,
      queueFor: this.queueFor.bind(this),
      stillConnecting: this.stillConnecting.bind(this),
      acquire: this.acquire.bind(this),
      sessionIdentity: this.sessionIdentity.bind(this),
      close: this.close.bind(this),
    }, label, request, role as AcpRole);
  }

  async prompt(label: string, command: string, role: string = DEFAULT_ACP_ROLE): Promise<string> {
    const roleName = role as AcpRole;
    const prefix = roleName === 'ask' ? /^ask\b/i : /^tell\b/i;
    const input = prefix.test(command.trim()) ? command : `${roleName} ${command}`;
    const result = await this.promptResult(label, input, roleName);
    return result.answered ? result.reply : result.error;
  }

  promptResult(
    label: string, command: string, role: string = DEFAULT_ACP_ROLE,
    options: PromptResultOptions = {},
  ): Promise<AcpPromptResult> {
    return new Promise((finish) => { this.run(label, command, finish, role, options); });
  }

  run(
    label: string, command: string, onDone: (result: AcpPromptResult) => void = () => {},
    role: string = DEFAULT_ACP_ROLE, options: PromptResultOptions = {},
  ): void {
    const roleName = role as AcpRole;
    const admission = options.admission;
    const dropIfNotAdmitted = (): boolean => {
      if (!admission || admission.isCurrent()) return false;
      admission.onDrop();
      onDone({ answered: false, error: 'ACP session closed.' });
      return true;
    };
    if (!dropIfNotAdmitted()) {
      const tab = this.managers.tab.byLabel(label);
      if (!tab) { onDone({ answered: false, error: 'Tab not found' }); return; }
      const runtime = tabRuntime(tab);
      const prefix = roleName === 'ask' ? /^ask\b\s*/i : /^tell\b\s*/i;
      const prompt = command.replace(prefix, '').trim();
      const refusal = existingAcpRoleRuntime(runtime, roleName)?.prompt ? 'ACP: a prompt is already running.'
        : prompt ? this.stillConnecting(label) ? STILL_CONNECTING : undefined
          : `Usage: ${roleName} <prompt>.`;
      const settings = refusal ? undefined : this.roleSettings(this.managers.tab.launchDir, roleName);
      const queue = settings ? this.queueFor(label, settings, roleName) : [];
      if (!dropIfNotAdmitted()) {
        if (refusal || !settings || queue.length === 0) {
          const error = refusal ?? noRoleModels(roleName);
          if (options.appendRefusalToTranscript ?? true) {
            appendAcp(this.managers, label, { input: command, output: error });
          }
          onDone({ answered: false, error });
          return;
        }
        // The prompt's gate authority, read once: a settings change mid-prompt takes effect from the next one.
        const nativeSettings = this.managers.nativeCommandSettings?.current();
        if (!dropIfNotAdmitted()) {
          this.attempt(label, {
            nativeSettings, command, prompt, role: roleName, settings, queue, failures: [],
            ...options.replyId && { replyId: options.replyId },
            ...(options.echo !== undefined && { echo: options.echo }), onDone,
          });
        }
      }
    }
  }

  // One model's try at the request. A request that settles because this model failed before it
  // replied closes the failed session and moves on to the next entry; anything else — an answer, a
  // refusal, a cancellation, a reset, or the last entry failing — settles the caller.
  deliver(label: string, role: string, delivery: SubagentDelivery): void {
    deliverSubagentMessage(this.managers, this.promptResult.bind(this), label, role as AcpRole, delivery);
  }

  private attempt(label: string, attempt: Attempt): void {
    const tab = this.managers.tab.byLabel(label);
    const [entry] = attempt.queue;
    if (!tab) { attempt.onDone({ answered: false, error: 'Tab not found' }); return; }
    if (!entry) { attempt.onDone({ answered: false, error: noRoleModels(attempt.role) }); return; }
    const runtime = tabRuntime(tab);
    const request: AcpPendingPrompt = {
      finish: (result) => { this.settleAttempt(label, attempt, request, result, runtime); },
      abort: new AbortController(),
      prompt: attempt.prompt,
      role: attempt.role,
      roleName: attempt.settings.name,
      commands: [...attempt.settings.commands],
      runningEntries: new Set(),
      ...(attempt.replyId && { replyId: attempt.replyId }),
      ...(attempt.echo !== undefined && { echo: attempt.echo }),
    };
    acpRoleRuntime(runtime, attempt.role).prompt = request;
    this.managers.tab.addBusy(label, request);
    try {
      prepareCorePromptRecord(this.managers.acpRecords, runtime, request, attempt.nativeSettings);
      if (acpRoleRuntime(runtime, attempt.role).prompt !== request) return;
      const session = this.acquire(label, entry, attempt.role);
      if (acpRoleRuntime(runtime, attempt.role).prompt !== request
        || !this.isCurrent(label, session, attempt.role)) return;
      runCorePrompt(this.managers, label, runtime, request, attempt.nativeSettings, session,
        this.sessionIdentity(label, attempt.role) ?? '', () => this.isCurrent(label, session, attempt.role));
    } catch (error) {
      const output = `ACP error: ${errorText(error)}`;
      appendAcp(this.managers, label, { input: attempt.command, output });
      request.modelFailed = true;
      this.close(label, output, attempt.role);
    }
  }

  private settleAttempt(
    label: string, attempt: Attempt, request: AcpPendingPrompt, result: AcpPromptResult, runtime: TabRuntime,
  ): void {
    const [entry, ...rest] = attempt.queue;
    const failed = !result.answered && request.modelFailed === true && request.replied !== true;
    const failures = failed && entry ? [...attempt.failures, { entry, error: result.error }] : attempt.failures;
    if (failed && entry && rest[0] && this.managers.tab.byLabel(label)) {
      this.close(label, undefined, attempt.role);
      appendAcp(this.managers, label, { input: '', output: fallbackNotice(entry, rest[0]) });
      this.attempt(label, { ...attempt, queue: rest, failures });
      return;
    }
    attempt.onDone(finalAttemptResult(result, failed, failures, attempt.role));
    scheduleSubagentDrain(this.managers, this.promptResult.bind(this), label, attempt.role, runtime);
  }

  launchableEntries(label: string, settings: AcpRoleSettings, role: string): RoleEntry[] {
    return this.queueFor(label, settings, role as AcpRole);
  }

  override closeTab(label: string, output?: AcpPromptResult | string): void {
    super.closeTab(label, output);
    this.managers.personaRoleSessions?.releaseTab(label);
  }

  private queueFor(label: string, settings: AcpRoleSettings, role: AcpRole): RoleEntry[] {
    const current = this.entryOf(label, role);
    const queue = attemptOrder(settings.entries, current)
      .filter(({ harness, model }) => this.managers.models.isKnownModel(harness, model));
    if (current && !this.managers.models.isKnownModel(current.harness, current.model)) {
      this.close(label, undefined, role);
    }
    return queue;
  }

  cancel(label: string, role: string = DEFAULT_ACP_ROLE): Promise<boolean> {
    const roleName = role as AcpRole;
    const managers = this.managers;
    const runtime = managers.tab.byLabel(label)?.runtime;
    const request = runtime ? acpRoleRuntime(runtime, roleName).prompt : undefined;
    if (!runtime || !request) return Promise.resolve(false);
    const session = this.currentSession(label, roleName);
    return cancelAcpPrompt(managers, label, roleName, runtime, request,
      session && (() => session.cancel()),
      () => session !== undefined && this.isCurrent(label, session, roleName));
  }

  private acquire(label: string, entry: RoleEntry, role: AcpRole) {
    return this.session(label, this.managers.tab.cwdOf(label) ?? process.cwd(), entry, {
      onError: (message) => {
        const output = message.startsWith('ACP:') ? message : `ACP: ${message}`;
        appendAcp(this.managers, label, { input: '', output });
        const runtime = this.managers.tab.byLabel(label)?.runtime;
        const pending = runtime ? acpRoleRuntime(runtime, role).prompt : undefined;
        if (pending) pending.modelFailed = true;
        this.close(label, output, role);
      },
      onConnect: () => messageBus.emit('state', { type: 'dirty' }),
    }, role);
  }

  private stillConnecting(label: string): boolean {
    if (!this.managers.tab.byLabel(label)?.remote) return false;
    const channel = this.managers.remote.get(label);
    return channel !== undefined && !channel.attached;
  }
}
