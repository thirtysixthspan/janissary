import type { MonitorSub } from './manager.js';
import { SUGGESTION_PREFIX } from './manager.js';
import type { Managers } from '../managers.js';
import { recordReply } from './reply.js';
import { recordContext } from './context.js';

// Query a running monitor's ACP session directly; the reply lands in the owner tab's
// transcript. Shares the `inFlight` slot with flushes, so a question never interleaves
// with a monitor-update prompt. `onRespawn` recovers the session on a prompt error, same
// as a failed flush.
export function askMonitor(
  reg: MonitorSub,
  owner: string,
  personaName: string,
  question: string,
  managers: Managers,
  onRespawn: () => void,
): void {
  reg.inFlight = true;
  let reply = '';
  managers.tab.startRunning(owner, `monitor ask ${personaName} ${question}`);
  const prompt = `[Question from the user]\n${question}\n\nAnswer directly; the suggestion format does not apply to this reply.`;
  recordContext(reg, prompt, 'input');
  reg.session.prompt(prompt, {
    onChunk: (text) => { reply += text; },
    onEnd: () => {
      reg.inFlight = false;
      recordReply(reg, managers, reply);
      // The 💡 prefix keeps the reply out of monitor buffers (like inline suggestions).
      managers.tab.finishRunning(owner, `${SUGGESTION_PREFIX} ${personaName}: ${reply.trim() || '(no reply)'}`);
    },
    onError: (message) => {
      managers.tab.finishRunning(owner, `monitor ${personaName}: ${message} — restarting monitor session`);
      onRespawn();
    },
  });
}
