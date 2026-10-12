import { acpLaunchFor, MARKDOWN_INSTRUCTION } from '../acp/launch.js';
import { connectAcp } from '../acp/index.js';
import { createRemoteAcpSession } from '../remote/acp-session.js';
import type { RemoteChannel } from '../remote/channel/index.js';
import { runAcpToolLoop } from '../acp/loop.js';
import { modelsFor } from '../harness/models.js';
import type { CommandInvocationContext } from '../commands/types.js';
import type { Managers } from '../managers.js';
import { errorText } from '../error-text.js';
import { isRecord } from '../value-guards.js';
import { agentPrimer, extractAgentCommand, runGrantedAgentCommand } from './command-tools.js';
import type { AgentRun } from './run.js';

export type AgentResult = Readonly<{
  status: 'completed' | 'failed' | 'terminated';
  response: string;
  cleanupWarnings: readonly string[];
}>;

export type RemoteAgentTarget = Readonly<{ channel: RemoteChannel; offline?: boolean }>;

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
  remote?: RemoteAgentTarget,
): Promise<AgentResult> {
  const selected = selectedModel(model);
  const launch = acpLaunchFor({ harness: 'opencode', model: selected, variant: effort ?? 'medium' });
  const env = {
    ...launch.env,
    OPENCODE_CONFIG_CONTENT: JSON.stringify({ model: selected }),
  };
  let connectionFailure: ((message: string) => void) | undefined;
  let pendingConnectionFailure: string | undefined;
  const reportConnectionFailure = (message: string) => {
    if (connectionFailure) connectionFailure(message);
    else pendingConnectionFailure = message;
  };
  const remoteSession = remote ? createRemoteAcpSession(remote.channel, {
      id: `agent-${run.id}`, command: launch.command, args: launch.args, env,
      offline: remote.offline, autonomous: true, effort: { level: effort ?? 'medium', model: selected },
    }, {
      onError: reportConnectionFailure,
      onConnect: () => {},
      onActivity: (kind, text) => run.reportActivity(kind, text),
      onTransportLost: () => run.abortController.abort(),
    }) : undefined;
  const session = remoteSession ?? connectAcp({
      command: launch.command,
      args: launch.args,
      cwd: run.executionDir,
      workspaceDir: run.executionDir,
      env,
      autonomous: true,
      effort: { level: effort ?? 'medium', model: selected },
      onActivity: (update) => {
        if (!isRecord(update) || typeof update.sessionUpdate !== 'string') return;
        const kind = update.sessionUpdate;
        const content = update.content;
        if (kind === 'agent_message_chunk' && isRecord(content) && content.type === 'text'
          && typeof content.text === 'string') {
          run.reportActivity('message', content.text);
        } else {
          run.reportActivity(kind, JSON.stringify(content ?? update) ?? String(content ?? update));
        }
      },
      onError: reportConnectionFailure,
    });
  run.addResource(`acp:${run.id}`, async () => {
    if (remoteSession) {
      if (!await remoteSession.release()) throw new Error('Remote agent close was not acknowledged.');
    } else session.kill();
  });
  if (remoteSession) {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let rejectAbort = (_error: Error) => {};
    // eslint-disable-next-line unicorn/prefer-promise-with-resolvers -- the project targets ES2023
    const abortPromise = new Promise<never>((_resolve, reject) => { rejectAbort = reject; });
    const onAbort = () => rejectAbort(new Error('Agent terminated.'));
    run.abortController.signal.addEventListener('abort', onAbort, { once: true });
    try {
      await Promise.race([
        remoteSession.ready,
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(() => reject(new Error('Agent: remote agent readiness timed out.')), 15_000);
        }),
        abortPromise,
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
      run.abortController.signal.removeEventListener('abort', onAbort);
    }
  }
  if (pendingConnectionFailure !== undefined) throw new Error(`Agent: ${pendingConnectionFailure}`);
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
    run.abortController.signal.addEventListener('abort', () => finish('Agent terminated.'), { once: true });
    runAcpToolLoop(session, taskPrompt(agentPrimer(run.snapshot), parameters), {
      signal: run.abortController.signal,
      primer: MARKDOWN_INSTRUCTION,
      maxSteps: Infinity,
      extractCommand: (text) => extractAgentCommand(text, run.snapshot.skills.some(({ name }) => name === 'ask-user')),
      runCommand: async (command) => {
        const isQuestion = command.startsWith('question ');
        if (isQuestion) run.setStatus('Waiting for answer');
        try {
          return await runGrantedAgentCommand(command, run.snapshot, managers, invocation);
        } finally {
          if (isQuestion && !run.abortController.signal.aborted) run.setStatus('Running');
        }
      },
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
  const message = errorText(error);
  return { status: 'failed', response: message.startsWith('Agent:') ? message : `Agent: ${message}`, cleanupWarnings: [] };
}
