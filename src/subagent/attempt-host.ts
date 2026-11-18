import type { CommandInvocationContext } from '../commands/types.js';
import { childInvocationContext } from '../command/invocation.js';
import type { Managers } from '../managers.js';
import type { AcpToolHost } from '../acp/types.js';
import { runWorkspaceCommandIn } from '../acp/workspace-runner.js';
import type { AgentRun } from '../agent/run.js';

export type SubagentAttemptHostOptions = Readonly<{
  run: AgentRun;
  invocation: CommandInvocationContext;
  managers: Managers;
  executionDir: string;
  active: () => boolean;
}>;

type NativeDispatchResult = {
  dispatched: boolean;
  output: string;
  coreResponse?: boolean;
  result?: unknown;
};

function mapCallerResult(result: NativeDispatchResult, command: string): string {
  if (!result.dispatched) throw new Error(`No ACP tool matched command: ${command}`);
  if (typeof result.result === 'string') return result.result;
  if (result.coreResponse) return result.output;
  if (result.result === undefined) return result.output;
  return JSON.stringify(result.result) ?? String(result.result);
}

export function createSubagentAttemptHost(options: SubagentAttemptHostOptions): AcpToolHost {
  const { run, invocation, managers, executionDir, active } = options;
  return {
    runWorkspace: (command) => {
      if (!active()) throw new Error('Subagent attempt ended.');
      return runWorkspaceCommandIn(executionDir, command, run.abortController.signal);
    },
    runCaller: async (command) => {
      if (!active()) throw new Error('Subagent attempt ended.');
      const child = childInvocationContext(invocation, command);
      const forwarded: CommandInvocationContext = Object.freeze({
        ...child,
        runId: run.id,
        caller: run.caller,
        signal: run.abortController.signal,
        acpTool: true,
        acpRole: 'ask',
        awaitResult: true,
      });
      const isQuestion = command.startsWith('question ');
      if (isQuestion) run.setStatus('Waiting for answer');
      try {
        const result = await managers.command.dispatchNativeLine(run.caller.label, command, forwarded);
        return mapCallerResult(result, command);
      } finally {
        if (isQuestion && active() && !run.abortController.signal.aborted) run.setStatus('Running');
      }
    },
  };
}
