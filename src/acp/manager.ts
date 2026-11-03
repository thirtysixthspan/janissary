import { AcpSessionManager } from './session-manager.js';
import { appendAcp, settleAcpPrompt } from './response.js';
import { messageBus } from '../bus.js';
import { modelsFor } from '../harness/models.js';
import { errorText } from '../error-text.js';
import { tabRuntime } from '../tab/runtime.js';
import type { AcpPromptResult } from './types.js';
import type { AcpPendingPrompt } from './prompt-state.js';
import { promptCoreRecord } from './record-feed.js';
import { runCorePrompt } from './run-prompt.js';

const PREFERRED_ACP_MODEL = 'google/gemini-3.1-flash-lite';
const STILL_CONNECTING = 'ACP: the remote session is still connecting.';
const NO_ACP_MODEL = 'ACP: no opencode model is available in the harness catalog.';

function resolveAcpModel(): string | undefined {
  const available = modelsFor('opencode');
  return available.includes(PREFERRED_ACP_MODEL) ? PREFERRED_ACP_MODEL : available[0];
}

export class AcpManager extends AcpSessionManager {
  start(label: string, request?: { withoutTools?: true }): { model?: string; error?: string; session?: string } {
    const tab = this.managers.tab.byLabel(label);
    if (!tab) return { error: 'Tab not found' };
    if (this.stillConnecting(label)) return { error: STILL_CONNECTING };
    const model = resolveAcpModel();
    if (!model) return { error: NO_ACP_MODEL };
    if (request?.withoutTools === true) tabRuntime(tab).acpWithoutTools = true;
    try {
      this.acquire(label, model);
      return { model, session: this.sessionIdentity(label) };
    } catch (error) {
      const output = `ACP error: ${errorText(error)}`;
      appendAcp(this.managers, label, { input: '', output });
      this.close(label, output);
      return { error: output };
    }
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
    const prompt = command.replace(/^acp\b\s*/i, '').trim();
    const refusal = runtime.acpPrompt ? 'ACP: a prompt is already running.'
      : prompt ? this.stillConnecting(label) ? STILL_CONNECTING : undefined
        : 'Usage: acp <prompt>.';
    const model = refusal ? undefined : resolveAcpModel();
    if (refusal || !model) {
      const error = refusal ?? NO_ACP_MODEL;
      appendAcp(this.managers, label, { input: command, output: error });
      onDone({ answered: false, error });
      return;
    }
    const request: AcpPendingPrompt = { finish: onDone, abort: new AbortController(), prompt };
    runtime.acpPrompt = request;
    try {
      promptCoreRecord(this.managers.acpRecords, runtime, request);
      if (runtime.acpPrompt !== request) return;
      const session = this.acquire(label, model);
      if (runtime.acpPrompt !== request || !this.isCurrent(label, session)) return;
      runCorePrompt(this.managers, label, runtime, request, session, this.sessionIdentity(label) ?? '',
        () => this.isCurrent(label, session));
    } catch (error) {
      const output = `ACP error: ${errorText(error)}`;
      appendAcp(this.managers, label, { input: command, output });
      this.close(label, output);
    }
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

  private acquire(label: string, model: string) {
    return this.session(label, this.managers.tab.cwdOf(label) ?? process.cwd(), model, {
      onError: (message) => {
        const output = message.startsWith('ACP:') ? message : `ACP: ${message}`;
        appendAcp(this.managers, label, { input: '', output });
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
