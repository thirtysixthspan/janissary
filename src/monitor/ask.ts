import { randomUUID } from 'node:crypto';
import type { MonitorSub } from './live-monitors.js';
import { SUGGESTION_PREFIX } from './suggestion.js';
import type { Managers } from '../managers.js';
import { recordReply } from './reply.js';
import { recordContext } from './context.js';
import { notify } from '../notifications/index.js';
import { isRateLimitError } from '../acp/rate-limit.js';
import { errorText } from '../error-text.js';

// Query a running monitor through the same core ACP entry point as its flushes, under the
// persona's role; the reply lands in the owner tab's transcript. Shares the `inFlight` slot with
// flushes, so a question never interleaves with a monitor-update prompt. An error result (the
// core refusal included) uses the existing monitor error line and leaves the core session alone.
export function askMonitor(
  reg: MonitorSub,
  owner: string,
  name: string,
  question: string,
  managers: Managers,
): void {
  reg.inFlight = true;
  const command = `monitor ask ${name} ${question}`;
  managers.tab.startRunning(owner, command, { background: randomUUID() });
  const prompt = `[Question from the user]\n${question}\n\nAnswer directly; the suggestion format does not apply to this reply.`;
  const fullPrompt = reg.firstPrompt ? `${reg.firstPrompt}\n\n${prompt}` : prompt;
  recordContext(reg, prompt, 'input');
  const finishError = (message: string): void => {
    managers.tab.finishRunning(owner, `monitor ${name}: ${message} — restarting monitor session`, { command });
    if (isRateLimitError(message)) notify(managers, 'rate-limited', owner);
  };
  void managers.acp.promptResult(owner, fullPrompt, reg.persona.role, { appendRefusalToTranscript: false }).then(
    (result) => {
      reg.inFlight = false;
      if (result.answered) {
        reg.firstPrompt = '';
        recordReply(reg, managers, result.reply);
        // The 💡 prefix keeps the reply out of monitor buffers (like inline suggestions).
        managers.tab.finishRunning(owner, `${SUGGESTION_PREFIX} ${name}: ${result.reply.trim() || '(no reply)'}`, { command });
      } else {
        finishError(result.error);
      }
    },
    (error: unknown) => { reg.inFlight = false; finishError(errorText(error)); },
  );
}
