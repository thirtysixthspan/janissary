// Autonomous tool loop for an ACP agent: the agent emits a single command, the
// host runs it, feeds the output back, and repeats until the agent answers
// without a command (or a step cap is reached). The control flow is pure — all
// side effects (rendering the transcript, executing the command) are injected,
// which keeps it testable independently of Ink/React and the live agent.

import type { AcpLoopSession, AcpLoopDeps as AcpLoopDependencies, AcpLoopHandlers } from './types.js';

/**
 * Drive the loop. Each turn streams the agent reply, then looks for a command:
 * if one is found and the step budget remains, it is executed, its output is
 * fed back as a follow-up prompt, and the loop continues; otherwise the loop
 * ends. The primer is prepended only to the very first prompt.
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
    h.startTurn(isFirst);
    promptOnce(turnPrompt, isFirst, step, 0);
  }

  // Send one prompt for the current turn. A freshly connected agent sometimes
  // returns an empty first reply (cold start — the model/provider loads lazily on
  // the first prompt); retry the first turn once, reusing the same entry, before
  // treating an empty reply as a final (no-command) answer.
  function promptOnce(turnPrompt: string, isFirst: boolean, step: number, attempt: number) {
    let buffer = '';
    const sent = isFirst && dependencies.primer ? `${dependencies.primer}\n\n${userPrompt}` : turnPrompt;
    session.prompt(sent, {
      onChunk: (text) => { buffer += text; h.chunk(buffer); },
      onEnd: async () => {
        if (!buffer.trim() && isFirst && attempt === 0) {
          promptOnce(turnPrompt, isFirst, step, attempt + 1);
          return;
        }
        const command = dependencies.extractCommand(buffer);
        let display = buffer;
        if (command) {
          const lines = display.split('\n');
          const cleaned = lines.map((l) => l.replace(/^[\s`$>]+/, '').replace(/`+\s*$/, '').trim());
          const index = cleaned.indexOf(command);
          if (index !== -1) {
            lines.splice(index, 1);
            // Remove adjacent code fence markers left behind by the removed command.
            if (index < lines.length && /^`{3,}\s*$/.test(lines[index])) lines.splice(index, 1);
            if (index > 0 && /^`{3,}\s*$/.test(lines[index - 1])) lines.splice(index - 1, 1);
            while (lines.length > 0 && lines.at(-1)!.trim() === '') lines.pop();
            display = lines.join('\n');
          }
        }
        h.endTurn(display);
        if (command && step < maxSteps) {
          // Only await when the command is actually async (e.g. browser); a sync command
          // (db) must complete in the same tick so callers/tests observing synchronously
          // see the full loop.
          const returnValue = dependencies.runCommand(command);
          const result = returnValue instanceof Promise ? await returnValue : returnValue;
          h.ranCommand(command, result);
          const followUp =
            `Output of \`${command}\`:\n${result}\n\n` +
            'If the task is complete, reply with the final answer and no command. ' +
            'Otherwise issue the next command. ' +
            'Be concise: do not explain what you are doing. Only output commands and the final answer.';
          turn(followUp, false, step + 1);
        } else {
          h.finished(command ? 'capped' : 'answered', maxSteps);
        }
      },
      onError: (message) => h.error(message),
    });
  }

  turn(userPrompt, true, 0);
}
