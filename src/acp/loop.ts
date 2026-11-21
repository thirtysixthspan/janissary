// Autonomous tool loop for an ACP agent: the agent emits commands inside labelled blocks, the host
// runs them in parallel, feeds each output back on its own turn, and repeats until the agent answers
// or a step cap is hit. The control flow is pure — all side effects (rendering the transcript,
// executing commands) are injected, which keeps it testable independently of the live agent.

import { errorText } from '../error-text.js';
import type { AcpLoopSession, AcpLoopDeps as AcpLoopDependencies, AcpLoopHandlers } from './types.js';

export const CORRECTION_PROMPT =
  'Your reply must contain one or more commands, each inside its own ```janissary fenced block. Try again.';

const REFUSAL = 'ACP: step limit reached; command not run.';
const CLOSING =
  'If the task is complete, reply with the final answer and no command. ' +
  'Otherwise issue the next command. ' +
  'Be concise: do not explain what you are doing. Only output commands and the final answer.';

type Result = { command: string; output: string; label: string };

/**
 * Drive the loop. Each turn streams the agent reply: a `batch` runs all of its commands in parallel
 * with one serialized follow-up per result, `mistake` sends the shared correction without spending a
 * step, and `absent` is the final answer.
 */
export function runAcpToolLoop(
  session: AcpLoopSession,
  userPrompt: string,
  dependencies: AcpLoopDependencies,
  h: AcpLoopHandlers,
): void {
  const maxSteps = dependencies.maxSteps ?? 8;
  const queue: Result[] = [];
  const pendingRefusals: Result[] = [];
  let step = 0;
  let done = false;
  let busy = false;
  let launching = false;
  let pendingCap = false;
  let inFlight = 0;

  function finish(reason: 'answered' | 'capped') {
    if (done) return;
    done = true;
    queue.length = 0;
    h.finished(reason, maxSteps);
  }

  function followUp(result: Result): string {
    return `Output of \`${result.label}\`:\n${result.output}\n\n${CLOSING}`;
  }

  function pump() {
    if (done || busy || dependencies.signal?.aborted) return;
    const next = queue.shift();
    if (next) {
      turn(followUp(next), false);
    } else if (pendingCap && inFlight === 0) {
      finish('capped');
    }
  }

  function flushRefusals() {
    if (inFlight !== 0 || pendingRefusals.length === 0) return;
    queue.push(...pendingRefusals);
    pendingRefusals.length = 0;
  }

  function deliver(result: Result) {
    queue.push(result);
    flushRefusals();
    if (!launching) pump();
  }

  function label(command: string): string {
    return dependencies.describeCommand?.(command) ?? command;
  }

  async function settle(command: string) {
    let output: string;
    try {
      const value = dependencies.runCommand(command);
      output = value instanceof Promise ? await value : value;
    } catch (error) {
      output = `ACP error: ${errorText(error)}`;
    }
    inFlight--;
    if (dependencies.signal?.aborted) return;
    h.ranCommand(command, output);
    deliver({ command, output, label: label(command) });
  }

  function launchBatch(commands: readonly { command: string }[]) {
    launching = true;
    for (const { command } of commands) {
      if (step >= maxSteps) {
        pendingCap = true;
        pendingRefusals.push({ command, output: REFUSAL, label: label(command) });
        continue;
      }
      step++;
      inFlight++;
      void settle(command);
    }
    launching = false;
    flushRefusals();
    pump();
  }

  // Start a turn's transcript entry, then issue the prompt into it.
  function turn(turnPrompt: string, isFirst: boolean) {
    if (dependencies.signal?.aborted || done) return;
    busy = true;
    h.startTurn(isFirst);
    promptOnce(turnPrompt, isFirst, 0);
  }

  // Send one prompt for the current turn. A freshly connected agent sometimes
  // returns an empty first reply (cold start — the model/provider loads lazily on
  // the first prompt); retry the first turn once, reusing the same entry, before
  // treating an empty reply as a final (no-command) answer.
  function promptOnce(turnPrompt: string, isFirst: boolean, attempt: number) {
    if (dependencies.signal?.aborted || done) return;
    let buffer = '';
    const sent = isFirst && dependencies.primer ? `${dependencies.primer}\n\n${userPrompt}` : turnPrompt;
    session.prompt(sent, {
      onChunk: (text) => { buffer += text; h.chunk(buffer); },
      onEnd: () => {
        if (dependencies.signal?.aborted || done) return;
        if (!buffer.trim() && isFirst && attempt === 0) {
          promptOnce(turnPrompt, isFirst, attempt + 1);
          return;
        }
        const result = dependencies.extractCommand(buffer);
        h.endTurn(buffer);
        busy = false;
        if (result.kind === 'mistake') {
          turn(CORRECTION_PROMPT, false);
        } else if (result.kind === 'batch') {
          if (step >= maxSteps) pendingCap = true;
          else launchBatch(result.commands);
        } else if (queue.length === 0 && inFlight === 0 && !pendingCap) {
          finish('answered');
        }
        pump();
      },
      onError: (message) => h.error(message),
    });
  }

  turn(userPrompt, true);
}
