import { realpathSync } from 'node:fs';
import path from 'node:path';
import { acpLaunchFor } from '../acp/launch.js';
import { connectAcp } from '../acp/index.js';
import { createRemoteAcpSession } from '../remote/acp-session.js';
import type { RemoteChannel } from '../remote/channel/index.js';
import { runToolLoop } from '../acp/drive-loop.js';
import { readWorkspaceCommand } from '../file-read/read.js';
import { selectedModel } from './model.js';
import { guardAcpHandlers } from '../acp/guard-handlers.js';
import type { CommandInvocationContext } from '../commands/types.js';
import type { Managers } from '../managers.js';
import { errorText } from '../error-text.js';
import { notify } from '../notifications/index.js';
import { sandboxWillConfine } from '../sandbox/confinement.js';
import { janissaryRoot } from '../janissary-root.js';
import { containedStrictly } from '../path-containment.js';
import { acpActivity } from '../acp/activity.js';
import { agentPrimer, runGrantedAgentCommand } from './command-tools.js';
import { awaitReady } from './readiness.js';
import type { AgentRun } from './run.js';

export type AgentResult = Readonly<{
  status: 'completed' | 'failed' | 'terminated';
  response: string;
  cleanupWarnings: readonly string[];
}>;

export type RemoteAgentTarget = Readonly<{ channel: RemoteChannel; offline?: boolean }>;

function taskPrompt(task: string, parameters: string): string {
  return [task, parameters].filter(Boolean).join('\n');
}

function selectedInstalledSkillDirs(run: AgentRun): string[] {
  const installedSkillsRoot = realpathSync(path.join(janissaryRoot(), 'skills'));
  return [...new Set(run.snapshot.skills.flatMap((skill) => {
    if (skill.source !== 'janissary') return [];
    const resolvedFile = realpathSync(skill.path);
    const directory = path.dirname(resolvedFile);
    return containedStrictly(installedSkillsRoot, directory) ? [directory] : [];
  }))];
}

// Said once, to the feed, whichever host reports that the agent is not confined: locally the sandbox
// check, remotely the far side's own answer on readiness.
function notifySandboxingDisabled(managers: Managers, run: AgentRun): void {
  notify(managers, 'manual', run.caller.label, 'Agent: sandboxing is disabled.');
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
  if (run.outcome || run.abortController.signal.aborted) return { status: 'terminated', response: 'Agent terminated.', cleanupWarnings: [] };
  const prompt = taskPrompt(agentPrimer(run.snapshot), parameters);
  run.record?.prompt(prompt);
  const selected = selectedModel(model, managers.models.modelsFor('opencode'));
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
      installedSkillDirs: selectedInstalledSkillDirs(run),
      env,
      autonomous: true,
      effort: { level: effort ?? 'medium', model: selected },
      onActivity: (update) => {
        const activity = acpActivity(update);
        if (activity) run.reportActivity(activity.kind, activity.text);
      },
      onError: reportConnectionFailure,
    });
  const localSession = remoteSession ? undefined : session;
  if (!remote && !sandboxWillConfine(run.executionDir)) notifySandboxingDisabled(managers, run);
  run.addResource(`acp:${run.id}`, async () => {
    if (remoteSession) {
      if (!await remoteSession.release()) throw new Error('Remote agent close was not acknowledged.');
    } else if (localSession) await localSession.shutdown();
  });
  if (remoteSession) {
    const sandboxed = await awaitReady(
      remoteSession.ready, run.abortController.signal, 15_000, 'Agent: remote agent readiness timed out.',
    );
    if (!sandboxed) notifySandboxingDisabled(managers, run);
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
    const active = () => !run.outcome && !run.abortController.signal.aborted;
    runToolLoop({
      prompt: (text, handlers) => {
        if (!active()) return;
        session.prompt(text, {
          onChunk: (chunk) => { if (active()) handlers.onChunk(chunk); },
          onEnd: (reason) => { if (active()) handlers.onEnd(reason); },
          onError: (message) => { if (active()) handlers.onError(message); },
        });
      },
    }, prompt, {
      kind: 'agent', grants: run.snapshot.grants,
      askUser: run.snapshot.skills.some(({ name }) => name === 'ask-user'),
    }, {
      runWorkspace: (command) => {
        if (!active()) throw new Error('Agent terminated.');
        return remote ? 'Remote connection unavailable.' : readWorkspaceCommand(run.executionDir, command.trim().replace(/^\//, ''));
      },
      runCaller: async (command) => {
        if (!active()) throw new Error('Agent terminated.');
        const isQuestion = command.startsWith('question ');
        if (isQuestion) run.setStatus('Waiting for answer');
        try {
          return await runGrantedAgentCommand(command, run.snapshot, managers, invocation);
        } finally {
          if (isQuestion && !run.abortController.signal.aborted) run.setStatus('Running');
        }
      },
    }, guardAcpHandlers({
      startTurn: () => {},
      chunk: () => {},
      endTurn: (answer) => { finalAnswer = answer; },
      startCommand: (command) => { run.record?.activity('tool', command); },
      ranCommand: (_command, result) => { run.record?.activity('tool', result); },
      finished: () => {
        if (finalAnswer.trim()) finish(finalAnswer);
        else fail(new Error('Agent: task returned an empty response.'));
      },
      error: (message) => fail(new Error(`Agent: ${message}`)),
    }, active), run.abortController.signal);
  });
  return { status: run.abortController.signal.aborted ? 'terminated' : 'completed', response, cleanupWarnings: [] };
}

export function agentFailure(error: unknown): AgentResult {
  const message = errorText(error);
  return { status: 'failed', response: message.startsWith('Agent:') ? message : `Agent: ${message}`, cleanupWarnings: [] };
}
