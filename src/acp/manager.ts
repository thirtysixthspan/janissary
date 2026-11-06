import { AcpSessionManager } from './session-manager.js';
import { appendAcp, settleAcpPrompt } from './response.js';
import { messageBus } from '../bus.js';
import { errorText } from '../error-text.js';
import { tabRuntime } from '../tab/runtime.js';
import type { AcpPromptResult } from './types.js';
import type { AcpPendingPrompt } from './prompt-state.js';
import { promptCoreRecord } from './record-feed.js';
import { runCorePrompt } from './run-prompt.js';
import type { Managers } from '../managers.js';
import type { RoleEntry } from '../plugins/roles/shared.js';
import {
  attemptOrder, exhaustedError, fallbackNotice, noRoleModels, readRoleSettings,
  type AcpRoleSettings, type AttemptFailure,
} from './ask-role.js';
import { acpRoleRuntime, existingAcpRoleRuntime } from './role-state.js';
import { DEFAULT_ACP_ROLE, type AcpRole } from './role.js';

const STILL_CONNECTING = 'ACP: the remote session is still connecting.';

type Attempt = {
  command: string;
  prompt: string;
  role: AcpRole;
  settings: AcpRoleSettings;
  queue: RoleEntry[];
  failures: AttemptFailure[];
  onDone: (result: AcpPromptResult) => void;
};

export class AcpManager extends AcpSessionManager {
  constructor(
    managers: Managers,
    private readonly roleSettings: (root: string, role: AcpRole) => AcpRoleSettings = readRoleSettings,
  ) {
    super(managers);
  }

  start(
    label: string, request?: { withoutTools?: true }, role: AcpRole = DEFAULT_ACP_ROLE,
  ): { model?: string; error?: string; session?: string } {
    const tab = this.managers.tab.byLabel(label);
    if (!tab) return { error: 'Tab not found' };
    if (this.stillConnecting(label)) return { error: STILL_CONNECTING };
    const settings = this.roleSettings(this.managers.tab.launchDir, role);
    const entries = this.queueFor(label, settings, role);
    if (entries.length === 0) return { error: noRoleModels(role) };
    if (request?.withoutTools === true) tabRuntime(tab).acpWithoutTools = true;
    const failures: AttemptFailure[] = [];
    for (const entry of entries) {
      try {
        const session = this.acquire(label, entry, role);
        if (this.isCurrent(label, session, role)) {
          return { model: entry.model, session: this.sessionIdentity(label, role) };
        }
        failures.push({ entry, error: 'ACP: the session closed while starting.' });
      } catch (error) {
        const output = `ACP error: ${errorText(error)}`;
        appendAcp(this.managers, label, { input: '', output });
        this.close(label, output, role);
        failures.push({ entry, error: output });
      }
    }
    return { error: failures.length > 1 ? exhaustedError(failures, role) : failures[0].error };
  }

  async prompt(label: string, command: string, role: AcpRole = DEFAULT_ACP_ROLE): Promise<string> {
    const prefix = role === 'ask' ? /^ask\b/i : /^tell\b/i;
    const input = prefix.test(command.trim()) ? command : `${role} ${command}`;
    const result = await this.promptResult(label, input, role);
    return result.answered ? result.reply : result.error;
  }

  promptResult(label: string, command: string, role: AcpRole = DEFAULT_ACP_ROLE): Promise<AcpPromptResult> {
    return new Promise((finish) => { this.run(label, command, finish, role); });
  }

  run(
    label: string, command: string, onDone: (result: AcpPromptResult) => void = () => {},
    role: AcpRole = DEFAULT_ACP_ROLE,
  ): void {
    const tab = this.managers.tab.byLabel(label);
    if (!tab) { onDone({ answered: false, error: 'Tab not found' }); return; }
    const runtime = tabRuntime(tab);
    const prefix = role === 'ask' ? /^ask\b\s*/i : /^tell\b\s*/i;
    const prompt = command.replace(prefix, '').trim();
    const refusal = existingAcpRoleRuntime(runtime, role)?.prompt ? 'ACP: a prompt is already running.'
      : prompt ? this.stillConnecting(label) ? STILL_CONNECTING : undefined
        : `Usage: ${role} <prompt>.`;
    const settings = refusal ? undefined : this.roleSettings(this.managers.tab.launchDir, role);
    const queue = settings ? this.queueFor(label, settings, role) : [];
    if (refusal || !settings || queue.length === 0) {
      const error = refusal ?? noRoleModels(role);
      appendAcp(this.managers, label, { input: command, output: error });
      onDone({ answered: false, error });
      return;
    }
    this.attempt(label, { command, prompt, role, settings, queue, failures: [], onDone });
  }

  // One model's try at the request. A request that settles because this model failed before it
  // replied closes the failed session and moves on to the next entry; anything else — an answer, a
  // refusal, a cancellation, a reset, or the last entry failing — settles the caller.
  private attempt(label: string, attempt: Attempt): void {
    const tab = this.managers.tab.byLabel(label);
    const [entry] = attempt.queue;
    if (!tab) { attempt.onDone({ answered: false, error: 'Tab not found' }); return; }
    if (!entry) { attempt.onDone({ answered: false, error: noRoleModels(attempt.role) }); return; }
    const runtime = tabRuntime(tab);
    const request: AcpPendingPrompt = {
      finish: (result) => { this.settleAttempt(label, attempt, request, result); },
      abort: new AbortController(),
      prompt: attempt.prompt,
      role: attempt.role,
      roleName: attempt.settings.name,
      commands: [...attempt.settings.commands],
      runningEntries: new Set(),
    };
    acpRoleRuntime(runtime, attempt.role).prompt = request;
    try {
      promptCoreRecord(this.managers.acpRecords, runtime, request);
      if (acpRoleRuntime(runtime, attempt.role).prompt !== request) return;
      const session = this.acquire(label, entry, attempt.role);
      if (acpRoleRuntime(runtime, attempt.role).prompt !== request
        || !this.isCurrent(label, session, attempt.role)) return;
      runCorePrompt(this.managers, label, runtime, request, session,
        this.sessionIdentity(label, attempt.role) ?? '', () => this.isCurrent(label, session, attempt.role));
    } catch (error) {
      const output = `ACP error: ${errorText(error)}`;
      appendAcp(this.managers, label, { input: attempt.command, output });
      request.modelFailed = true;
      this.close(label, output, attempt.role);
    }
  }

  private settleAttempt(label: string, attempt: Attempt, request: AcpPendingPrompt, result: AcpPromptResult): void {
    const [entry, ...rest] = attempt.queue;
    const failed = !result.answered && request.modelFailed === true && request.replied !== true;
    const failures = failed && entry ? [...attempt.failures, { entry, error: result.error }] : attempt.failures;
    if (failed && entry && rest[0] && this.managers.tab.byLabel(label)) {
      this.close(label, undefined, attempt.role);
      appendAcp(this.managers, label, { input: '', output: fallbackNotice(entry, rest[0]) });
      this.attempt(label, { ...attempt, queue: rest, failures });
      return;
    }
    attempt.onDone(failed && failures.length > 1
      ? { answered: false, error: exhaustedError(failures, attempt.role) } : result);
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

  cancel(label: string, role: AcpRole = DEFAULT_ACP_ROLE): Promise<boolean> {
    const runtime = this.managers.tab.byLabel(label)?.runtime;
    const request = runtime ? acpRoleRuntime(runtime, role).prompt : undefined;
    if (!runtime || !request) return Promise.resolve(false);
    if (request.cancellation) return request.cancellation;
    const session = this.currentSession(label, role);
    const completion = { resolve: (_result: boolean) => {} };
    const settled = new Promise<boolean>((resolve) => { completion.resolve = resolve; });
    request.cancellation = settled;
    const finish = request.finish;
    request.finish = (result) => { finish(result); completion.resolve(true); };
    request.abort.abort();
    const current = () => this.managers.tab.byLabel(label)?.runtime === runtime
      && acpRoleRuntime(runtime, role).prompt === request
      && session !== undefined && this.isCurrent(label, session, role);
    void (async () => {
      try {
        await session?.cancel();
        if (current()) settleAcpPrompt(
          this.managers, label, { answered: false, error: 'ACP: prompt cancelled.' }, undefined, role,
        );
      } catch (error) {
        if (current()) this.close(label, `ACP: cancellation failed: ${errorText(error)}`, role);
      }
    })();
    return settled;
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
