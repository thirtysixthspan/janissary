import { acpLaunchFor, MARKDOWN_INSTRUCTION } from '../acp/launch.js';
import { connectAcp } from '../acp/index.js';
import { runAcpToolLoop } from '../acp/loop.js';
import { modelsFor } from '../harness/models.js';
import type { CommandInvocationContext } from '../commands/types.js';
import type { Managers } from '../managers.js';
import { errorText } from '../error-text.js';
import { agentPrimer, extractAgentCommand, runGrantedAgentCommand } from './command-tools.js';
import type { AgentRun } from './run.js';

export type AgentResult = Readonly<{
  status: 'completed' | 'failed' | 'terminated';
  response: string;
  cleanupWarnings: readonly string[];
}>;

function selectedModel(model: string | undefined): string {
  const available = modelsFor('opencode');
  const selected = model ?? available.find((item) => item === 'google/gemini-3.1-flash-lite') ?? available[0];
  if (!selected || !available.includes(selected)) throw new Error(`Agent: unknown model "${model ?? ''}".`);
  return selected;
}

function taskPrompt(task: string, parameters: string): string {
  return [task, parameters].filter(Boolean).join('\n');
}

export async function executeAgentRun(
  run: AgentRun,
  invocation: CommandInvocationContext,
  model: string | undefined,
  effort: string | undefined,
  parameters: string,
  managers: Managers,
): Promise<AgentResult> {
  const selected = selectedModel(model);
  const launch = acpLaunchFor({ harness: 'opencode', model: selected, variant: effort ?? 'medium' });
  const env = {
    ...launch.env,
    OPENCODE_CONFIG_CONTENT: JSON.stringify({ model: selected }),
  };
  let connectionFailure: ((message: string) => void) | undefined;
  const response = await new Promise<string>((resolve, reject) => {
    let settled = false;
    let finalAnswer = '';
    const finish = (answer: string) => {
      if (settled) return;
      settled = true;
      resolve(answer);
    };
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    connectionFailure = (message) => fail(new Error(`Agent: ${message}`));
    const session = connectAcp({
      command: launch.command,
      args: launch.args,
      cwd: run.caller.cwd,
      workspaceDir: run.caller.cwd,
      env,
      autonomous: true,
      effort: { level: effort ?? 'medium', model: selected },
      onError: (message) => connectionFailure?.(message),
    });
    run.addResource(`acp:${run.id}`, () => session.kill());
    run.abortController.signal.addEventListener('abort', () => finish('Agent terminated.'), { once: true });
    runAcpToolLoop(session, taskPrompt(agentPrimer(run.snapshot), parameters), {
      signal: run.abortController.signal,
      primer: MARKDOWN_INSTRUCTION,
      maxSteps: Infinity,
      extractCommand: (text) => extractAgentCommand(text, run.snapshot.skills.some(({ name }) => name === 'ask-user')),
      runCommand: (command) => runGrantedAgentCommand(command, run.snapshot, managers, invocation),
    }, {
      startTurn: () => {},
      chunk: () => {},
      endTurn: (answer) => { finalAnswer = answer; },
      ranCommand: () => {},
      finished: () => {
        if (finalAnswer.trim()) finish(finalAnswer);
        else fail(new Error('Agent: task returned an empty response.'));
      },
      error: (message) => fail(new Error(`Agent: ${message}`)),
    });
  });
  return { status: run.abortController.signal.aborted ? 'terminated' : 'completed', response, cleanupWarnings: [] };
}

export function agentFailure(error: unknown): AgentResult {
  return { status: 'failed', response: `Agent: ${errorText(error)}`, cleanupWarnings: [] };
}
