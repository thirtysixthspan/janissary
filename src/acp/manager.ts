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
import { NATIVE_ACP_COMMANDS, type RoleEntry } from '../plugins/roles/shared.js';
import {
  askRoleSettings, attemptOrder, exhaustedError, fallbackNotice, NO_ASK_MODEL,
  type AcpRoleSettings, type AskModels, type AskRoleSettingsReader, type AttemptFailure,
} from './ask-role.js';

const STILL_CONNECTING = 'ACP: the remote session is still connecting.';

type Attempt = {
  command: string;
  prompt: string;
  settings: AcpRoleSettings;
  queue: RoleEntry[];
  failures: AttemptFailure[];
  onDone: (result: AcpPromptResult) => void;
};

export class AcpManager extends AcpSessionManager {
  // The array form keeps existing model-queue tests focused; production reads the full role snapshot.
  constructor(
    managers: Managers,
    private readonly roleSettings: AskRoleSettingsReader | AskModels = askRoleSettings,
  ) {
    super(managers);
  }

  start(label: string, request?: { withoutTools?: true }): { model?: string; error?: string; session?: string } {
    const tab = this.managers.tab.byLabel(label);
    if (!tab) return { error: 'Tab not found' };
    if (this.stillConnecting(label)) return { error: STILL_CONNECTING };
    const settings = this.readRoleSettings();
    const entries = this.queueFor(label, settings);
    if (entries.length === 0) return { error: NO_ASK_MODEL };
    if (request?.withoutTools === true) tabRuntime(tab).acpWithoutTools = true;
    const failures: AttemptFailure[] = [];
    for (const entry of entries) {
      try {
        const session = this.acquire(label, entry);
        if (this.isCurrent(label, session)) return { model: entry.model, session: this.sessionIdentity(label) };
        failures.push({ entry, error: 'ACP: the session closed while starting.' });
      } catch (error) {
        const output = `ACP error: ${errorText(error)}`;
        appendAcp(this.managers, label, { input: '', output });
        this.close(label, output);
        failures.push({ entry, error: output });
      }
    }
    return { error: failures.length > 1 ? exhaustedError(failures) : failures[0].error };
  }

  async prompt(label: string, command: string): Promise<string> {
    const result = await this.promptResult(label, command);
    return result.answered ? result.reply : result.error;
  }

  promptResult(label: string, command: string): Promise<AcpPromptResult> {
    return new Promise((finish) => { this.run(label, command, finish); });
  }

  run(label: string, command: string, onDone: (result: AcpPromptResult) => void = () => {}): void {
    const tab = this.managers.tab.byLabel(label);
    if (!tab) { onDone({ answered: false, error: 'Tab not found' }); return; }
    const runtime = tabRuntime(tab);
    const prompt = command.replace(/^ask\b\s*/i, '').trim();
    const refusal = runtime.acpPrompt ? 'ACP: a prompt is already running.'
      : prompt ? this.stillConnecting(label) ? STILL_CONNECTING : undefined
        : 'Usage: ask <prompt>.';
    const settings = refusal ? undefined : this.readRoleSettings();
    const queue = settings ? this.queueFor(label, settings) : [];
    if (refusal || !settings || queue.length === 0) {
      const error = refusal ?? NO_ASK_MODEL;
      appendAcp(this.managers, label, { input: command, output: error });
      onDone({ answered: false, error });
      return;
    }
    this.attempt(label, { command, prompt, settings, queue, failures: [], onDone });
  }

  // One model's try at the request. A request that settles because this model failed before it
  // replied closes the failed session and moves on to the next entry; anything else — an answer, a
  // refusal, a cancellation, a reset, or the last entry failing — settles the caller.
  private attempt(label: string, attempt: Attempt): void {
    const tab = this.managers.tab.byLabel(label);
    const [entry] = attempt.queue;
    if (!tab) { attempt.onDone({ answered: false, error: 'Tab not found' }); return; }
    if (!entry) { attempt.onDone({ answered: false, error: NO_ASK_MODEL }); return; }
    const runtime = tabRuntime(tab);
    const request: AcpPendingPrompt = {
      finish: (result) => { this.settleAttempt(label, attempt, request, result); },
      abort: new AbortController(),
      prompt: attempt.prompt,
      roleName: attempt.settings.name,
      commands: [...attempt.settings.commands],
    };
    runtime.acpPrompt = request;
    try {
      promptCoreRecord(this.managers.acpRecords, runtime, request);
      if (runtime.acpPrompt !== request) return;
      const session = this.acquire(label, entry);
      if (runtime.acpPrompt !== request || !this.isCurrent(label, session)) return;
      runCorePrompt(this.managers, label, runtime, request, session, this.sessionIdentity(label) ?? '',
        () => this.isCurrent(label, session));
    } catch (error) {
      const output = `ACP error: ${errorText(error)}`;
      appendAcp(this.managers, label, { input: attempt.command, output });
      request.modelFailed = true;
      this.close(label, output);
    }
  }

  private settleAttempt(label: string, attempt: Attempt, request: AcpPendingPrompt, result: AcpPromptResult): void {
    const [entry, ...rest] = attempt.queue;
    const failed = !result.answered && request.modelFailed === true && request.replied !== true;
    const failures = failed && entry ? [...attempt.failures, { entry, error: result.error }] : attempt.failures;
    if (failed && entry && rest[0] && this.managers.tab.byLabel(label)) {
      this.close(label);
      appendAcp(this.managers, label, { input: '', output: fallbackNotice(entry, rest[0]) });
      this.attempt(label, { ...attempt, queue: rest, failures });
      return;
    }
    attempt.onDone(failed && failures.length > 1 ? { answered: false, error: exhaustedError(failures) } : result);
  }

  private queueFor(label: string, settings: AcpRoleSettings): RoleEntry[] {
    const current = this.entryOf(label);
    const queue = attemptOrder(settings.entries, current)
      .filter(({ harness, model }) => this.managers.models.isKnownModel(harness, model));
    if (current && !this.managers.models.isKnownModel(current.harness, current.model)) this.close(label);
    return queue;
  }

  private readRoleSettings(): AcpRoleSettings {
    const settings = this.roleSettings(this.managers.tab.launchDir);
    if (!Array.isArray(settings)) {
      return {
        name: settings.name,
        entries: settings.entries.map((entry) => ({ ...entry })),
        commands: [...settings.commands],
      };
    }
    return { name: 'ask', entries: settings.map((entry) => ({ ...entry })), commands: [...NATIVE_ACP_COMMANDS] };
  }

  cancel(label: string): Promise<boolean> {
    const runtime = this.managers.tab.byLabel(label)?.runtime;
    const request = runtime?.acpPrompt;
    if (!request) return Promise.resolve(false);
    if (request.cancellation) return request.cancellation;
    const session = this.currentSession(label);
    const completion = { resolve: (_result: boolean) => {} };
    const settled = new Promise<boolean>((resolve) => { completion.resolve = resolve; });
    request.cancellation = settled;
    const finish = request.finish;
    request.finish = (result) => { finish(result); completion.resolve(true); };
    request.abort.abort();
    const current = () => this.managers.tab.byLabel(label)?.runtime === runtime
      && runtime.acpPrompt === request && session !== undefined && this.isCurrent(label, session);
    void (async () => {
      try {
        await session?.cancel();
        if (current()) settleAcpPrompt(this.managers, label, { answered: false, error: 'ACP: prompt cancelled.' });
      } catch (error) {
        if (current()) this.close(label, `ACP: cancellation failed: ${errorText(error)}`);
      }
    })();
    return settled;
  }

  private acquire(label: string, entry: RoleEntry) {
    return this.session(label, this.managers.tab.cwdOf(label) ?? process.cwd(), entry, {
      onError: (message) => {
        const output = message.startsWith('ACP:') ? message : `ACP: ${message}`;
        appendAcp(this.managers, label, { input: '', output });
        const pending = this.managers.tab.byLabel(label)?.runtime?.acpPrompt;
        if (pending) pending.modelFailed = true;
        this.close(label, output);
      },
      onConnect: () => messageBus.emit('state', { type: 'dirty' }),
    });
  }

  private stillConnecting(label: string): boolean {
    if (!this.managers.tab.byLabel(label)?.remote) return false;
    const channel = this.managers.remote.get(label);
    return channel !== undefined && !channel.attached;
  }
}
