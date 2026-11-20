// Autonomous tool loop for an ACP agent: the agent emits a single command inside a labelled block,
// the host runs it, feeds the output back, and repeats until the agent answers or a mistake needs
// correcting. The control flow is pure — all side effects (rendering the transcript, executing the
// command) are injected, which keeps it testable independently of the live agent.

import type { CommandBlockSpan } from './command-block.js';
import { errorText } from '../error-text.js';
import type { AcpLoopSession, AcpLoopDeps as AcpLoopDependencies, AcpLoopHandlers } from './types.js';

export const CORRECTION_PROMPT =
  'Your reply must contain exactly one command inside a final ```janissary fenced block. Try again.';

/**
 * Drive the loop. Each turn streams the agent reply, then reads the labelled block: `one` runs the
 * command while the step budget remains and feeds its output back; `mistake` sends the shared
 * correction sentence on the same path without spending a step; `absent` is the final answer.
 */
export function runAcpToolLoop(
  session: AcpLoopSession,
  userPrompt: string,
  dependencies: AcpLoopDependencies,
  h: AcpLoopHandlers,
): void {
  const maxSteps = dependencies.maxSteps ?? 8;

  // Start a turn's transcript entry, then issue the prompt into it.
  function turn(turnPrompt: string, isFirst: boolean, step: number) {
    if (dependencies.signal?.aborted) return;
    h.startTurn(isFirst);
    promptOnce(turnPrompt, isFirst, step, 0);
  }

  // Send one prompt for the current turn. A freshly connected agent sometimes
  // returns an empty first reply (cold start — the model/provider loads lazily on
  // the first prompt); retry the first turn once, reusing the same entry, before
  // treating an empty reply as a final (no-command) answer.
  function promptOnce(turnPrompt: string, isFirst: boolean, step: number, attempt: number) {
    if (dependencies.signal?.aborted) return;
    let buffer = '';
    const sent = isFirst && dependencies.primer ? `${dependencies.primer}\n\n${userPrompt}` : turnPrompt;
    session.prompt(sent, {
      onChunk: (text) => { buffer += text; h.chunk(buffer); },
      onEnd: async () => {
        if (dependencies.signal?.aborted) return;
        if (!buffer.trim() && isFirst && attempt === 0) {
          promptOnce(turnPrompt, isFirst, step, attempt + 1);
          return;
        }
        const result = dependencies.extractCommand(buffer);
        const display = result.kind === 'one' ? filterCommandFromDisplay(buffer, result.span) : buffer;
        h.endTurn(display);
        if (result.kind === 'mistake') {
          turn(CORRECTION_PROMPT, false, step);
        } else if (result.kind === 'one' && step < maxSteps) {
          // Native commands may answer synchronously or through the dispatcher; await a promise
          // result so the loop always feeds back the completed output.
          let output: string;
          try {
            const returnValue = dependencies.runCommand(result.command);
            output = returnValue instanceof Promise ? await returnValue : returnValue;
          } catch (error) {
            h.error(errorText(error));
            h.finished('failed', maxSteps);
            return;
          }
          if (dependencies.signal?.aborted) return;
          h.ranCommand(result.command, output);
          const followUp =
            `Output of \`${dependencies.describeCommand?.(result.command) ?? result.command}\`:\n${output}\n\n` +
            'If the task is complete, reply with the final answer and no command. ' +
            'Otherwise issue the next command. ' +
            'Be concise: do not explain what you are doing. Only output commands and the final answer.';
          turn(followUp, false, step + 1);
        } else {
          h.finished(result.kind === 'one' ? 'capped' : 'answered', maxSteps);
        }
      },
      onError: (message) => h.error(message),
    });
  }

  turn(userPrompt, true, 0);
}

function filterCommandFromDisplay(display: string, span: CommandBlockSpan | undefined): string {
  if (!span) return display;
  const lines = display.split('\n');
  const starts: number[] = [];
  let offset = 0;
  for (const line of lines) {
    starts.push(offset);
    offset += line.length + 1;
  }
  const first = lineAt(starts, span.start);
  const last = lineAt(starts, span.end - 1);
  lines.splice(first, last - first + 1);
  // A bare command line inside a fence leaves its markers behind once removed.
  if (first > 0 && first < lines.length && isFence(lines[first - 1]) && isFence(lines[first])) {
    lines.splice(first - 1, 2);
  }
  while (lines.length > 0 && lines.at(-1)!.trim() === '') lines.pop();
  return lines.join('\n');
}

function lineAt(starts: number[], offset: number): number {
  let index = starts.length - 1;
  while (index > 0 && starts[index] > offset) index--;
  return index;
}

function isFence(line: string): boolean {
  return /^ {0,3}(`{3,}|~{3,})[ \t]*$/.test(line);
}
