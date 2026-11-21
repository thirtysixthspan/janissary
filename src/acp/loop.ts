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
type Phase = 'idle' | 'awaiting' | 'launching' | 'done';

// One state owns every coordination fact: which phase of a turn the loop is in, how many commands
// are still settling, and whether the step cap has been reached. Transitions go through this object
// instead of independent flag checks, so a capped command is treated the same at every entry point.
type State = { phase: Phase; inFlight: number; capped: boolean };

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
  let state: State = { phase: 'idle', inFlight: 0, capped: false };

  function transition(phase: Phase): void {
    state = { ...state, phase };
  }

  function finish(reason: 'answered' | 'capped') {
    if (state.phase === 'done') return;
    transition('done');
    queue.length = 0;
    h.finished(reason, maxSteps);
  }

  function followUp(result: Result): string {
    return `Output of \`${result.label}\`:\n${result.output}\n\n${CLOSING}`;
  }

  function pump() {
    if (state.phase === 'done' || state.phase === 'awaiting' || state.phase === 'launching'
      || dependencies.signal?.aborted) return;
    const next = queue.shift();
    if (next) {
      turn(followUp(next), false);
    } else if (state.capped && state.inFlight === 0) {
      finish('capped');
    }
  }

  function flushRefusals() {
    if (state.inFlight !== 0 || pendingRefusals.length === 0) return;
    queue.push(...pendingRefusals);
    pendingRefusals.length = 0;
  }

  function deliver(result: Result) {
    queue.push(result);
    flushRefusals();
    if (state.phase !== 'launching') pump();
  }

  function label(command: string): string {
    return dependencies.describeCommand?.(command) ?? command;
  }

  // Every command skipped by the step cap is reported the same way on both cap paths: a ranCommand
  // event for the transcript and the step tally. Commands skipped inside a launched batch also get a
  // refusal result fed back to the agent; a batch that arrives once the cap is already reached is
  // only reported, since feeding it back would keep a capped loop alive.
  function skipOverBudget(commands: readonly { command: string }[], feedback: boolean) {
    for (const { command } of commands) {
      if (feedback) pendingRefusals.push({ command, output: REFUSAL, label: label(command) });
      h.ranCommand(command, REFUSAL);
    }
    state = { ...state, capped: true };
  }

  async function settle(command: string) {
    let output: string;
    try {
      const value = dependencies.runCommand(command);
      output = value instanceof Promise ? await value : value;
    } catch (error) {
      output = `ACP error: ${errorText(error)}`;
    }
    state = { ...state, inFlight: state.inFlight - 1 };
    if (dependencies.signal?.aborted) return;
    h.ranCommand(command, output);
    deliver({ command, output, label: label(command) });
  }

  function launchBatch(commands: readonly { command: string }[]) {
    transition('launching');
    for (const { command } of commands) {
      if (step >= maxSteps) {
        skipOverBudget([{ command }], true);
        continue;
      }
      step++;
      state = { ...state, inFlight: state.inFlight + 1 };
      void settle(command);
    }
    transition('idle');
    flushRefusals();
    pump();
  }

  // Start a turn's transcript entry, then issue the prompt into it.
  function turn(turnPrompt: string, isFirst: boolean) {
    if (dependencies.signal?.aborted || state.phase === 'done') return;
    transition('awaiting');
    h.startTurn(isFirst);
    promptOnce(turnPrompt, isFirst, 0);
  }

  // Send one prompt for the current turn. A freshly connected agent sometimes
  // returns an empty first reply (cold start — the model/provider loads lazily on
  // the first prompt); retry the first turn once, reusing the same entry, before
  // treating an empty reply as a final (no-command) answer.
  function promptOnce(turnPrompt: string, isFirst: boolean, attempt: number) {
    if (dependencies.signal?.aborted || state.phase === 'done') return;
    let buffer = '';
    const sent = isFirst && dependencies.primer ? `${dependencies.primer}\n\n${userPrompt}` : turnPrompt;
    session.prompt(sent, {
      onChunk: (text) => { buffer += text; h.chunk(buffer); },
      onEnd: () => {
        if (dependencies.signal?.aborted || state.phase === 'done') return;
        if (!buffer.trim() && isFirst && attempt === 0) {
          promptOnce(turnPrompt, isFirst, attempt + 1);
          return;
        }
        const result = dependencies.extractCommand(buffer);
        h.endTurn(buffer);
        transition('idle');
        if (result.kind === 'mistake') {
          turn(CORRECTION_PROMPT, false);
        } else if (result.kind === 'batch') {
          if (state.capped || step >= maxSteps) skipOverBudget(result.commands, false);
          else launchBatch(result.commands);
        } else if (queue.length === 0 && state.inFlight === 0 && !state.capped) {
          finish('answered');
        }
        pump();
      },
      onError: (message) => h.error(message),
    });
  }

  turn(userPrompt, true);
}
