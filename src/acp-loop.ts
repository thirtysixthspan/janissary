// Autonomous tool loop for an ACP agent: the agent emits a single command, the
// host runs it, feeds the output back, and repeats until the agent answers
// without a command (or a step cap is reached). The control flow is pure — all
// side effects (rendering the transcript, executing the command) are injected,
// which keeps it testable independently of Ink/React and the live agent.

import type { AcpLoopSession, AcpLoopDeps, AcpLoopHandlers } from './types.js';

/**
 * Drive the loop. Each turn streams the agent reply, then looks for a command:
 * if one is found and the step budget remains, it is executed, its output is
 * fed back as a follow-up prompt, and the loop continues; otherwise the loop
 * ends. The primer is prepended only to the very first prompt.
 */
export function runAcpToolLoop(
  session: AcpLoopSession,
  userPrompt: string,
  deps: AcpLoopDeps,
  h: AcpLoopHandlers,
): void {
  const maxSteps = deps.maxSteps ?? 8;

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
    const sent = isFirst && deps.primer ? `${deps.primer}\n\n${userPrompt}` : turnPrompt;
    session.prompt(sent, {
      onChunk: (text) => { buffer += text; h.chunk(buffer); },
      onEnd: async () => {
        if (!buffer.trim() && isFirst && attempt === 0) {
          promptOnce(turnPrompt, isFirst, step, attempt + 1);
          return;
        }
        const cmd = deps.extractCommand(buffer);
        let display = buffer;
        if (cmd) {
          const lines = display.split('\n');
          const cleaned = lines.map((l) => l.replace(/^[\s`$>]+/, '').replace(/`+\s*$/, '').trim());
          const idx = cleaned.findIndex((l) => l === cmd);
          if (idx !== -1) {
            lines.splice(idx, 1);
            // Remove adjacent code fence markers left behind by the removed command.
            if (idx < lines.length && /^`{3,}\s*$/.test(lines[idx])) lines.splice(idx, 1);
            if (idx > 0 && /^`{3,}\s*$/.test(lines[idx - 1])) lines.splice(idx - 1, 1);
            while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();
            display = lines.join('\n');
          }
        }
        h.endTurn(display);
        if (cmd && step < maxSteps) {
          // Only await when the command is actually async (e.g. browser); a sync command
          // (db) must complete in the same tick so callers/tests observing synchronously
          // see the full loop.
          const ret = deps.runCommand(cmd);
          const result = ret instanceof Promise ? await ret : ret;
          h.ranCommand(cmd, result);
          const followUp =
            `Output of \`${cmd}\`:\n${result}\n\n` +
            'If the task is complete, reply with the final answer and no command. ' +
            'Otherwise issue the next command. ' +
            'Be concise: do not explain what you are doing. Only output commands and the final answer.';
          turn(followUp, false, step + 1);
        } else {
          h.finished(cmd ? 'capped' : 'answered', maxSteps);
        }
      },
      onError: (msg) => h.error(msg),
    });
  }

  turn(userPrompt, true, 0);
}
