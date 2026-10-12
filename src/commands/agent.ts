import { randomUUID } from 'node:crypto';
import type { Command, CommandInvocationContext, CommandManagers } from './types.js';
import { commands } from './index.js';
import { parseAgentCommand } from '../agent/command-parser.js';
import { resolveAgentSnapshot } from '../agent/task-resolution.js';
import { janissaryRoot } from '../janissary-root.js';
import { agentFailure, executeAgentRun, type AgentResult } from '../agent/execute.js';
import { appendCommandOutput } from '../command/append.js';

function formatResult(result: AgentResult): string {
  return [
    `Status: ${result.status}`,
    result.response,
    ...result.cleanupWarnings.map((warning) => `Cleanup warning: ${warning}`),
  ].join('\n');
}

function invocationFor(label: string, managers: CommandManagers, invocation?: CommandInvocationContext): CommandInvocationContext {
  const tab = managers.tab.byLabel(label);
  if (!tab) throw new Error(`Agent caller not found: ${label}`);
  const captured = managers.agent.captureCaller(tab);
  if (invocation?.caller.incarnation && invocation.caller.incarnation !== captured.incarnation) {
    throw new Error(`Agent caller is stale: ${label}`);
  }
  if (invocation) {
    return Object.freeze({
      ...invocation,
      caller: Object.freeze({ ...captured, cwd: invocation.caller.cwd, context: invocation.caller.context }),
    });
  }
  return Object.freeze({
    runId: randomUUID(),
    invocationId: randomUUID(),
    caller: { ...captured, incarnation: captured.incarnation ?? randomUUID() },
    signal: new AbortController().signal,
  });
}

async function runAgent(
  commandText: string,
  label: string,
  managers: CommandManagers,
  invocation?: CommandInvocationContext,
): Promise<AgentResult> {
  const launch = parseAgentCommand(commandText);
  if ('error' in launch) return { status: 'failed', response: launch.error, cleanupWarnings: [] };
  try {
    const caller = invocationFor(label, managers, invocation);
    if (caller.signal.aborted) return { status: 'terminated', response: 'Agent terminated.', cleanupWarnings: [] };
    const sourceLabel = launch.workspace ?? label;
    const sourceTab = managers.tab.byLabel(sourceLabel);
    const remoteAddress = managers.remote.addressOf(sourceLabel);
    if (launch.host && (!remoteAddress || remoteAddress.host.toLowerCase() !== launch.host.toLowerCase())) {
      throw new Error('requested remote host must match an established remote workspace.');
    }
    if (launch.workspace && (!sourceTab || !remoteAddress)) {
      throw new Error(`remote workspace "${launch.workspace}" is not available.`);
    }
    const remoteChannel = managers.remote.get(sourceLabel);
    const remoteWorkspace = managers.remote.workspaceOf(sourceLabel);
    const useRemote = Boolean(launch.host || launch.workspace || remoteAddress);
    if (useRemote && (!remoteChannel?.attached || !remoteWorkspace)) {
      throw new Error('remote workspace is not ready.');
    }
    const snapshot = useRemote && remoteChannel
      ? await remoteChannel.resolveAgentSnapshot(launch.task, [...launch.skills])
      : resolveAgentSnapshot(launch.task, launch.skills, {
        workspaceDir: caller.caller.cwd,
        installationDir: janissaryRoot(),
      }, commands.map(({ name }) => name));
    const releaseWorkspace = useRemote ? managers.remote.acquireAgentLease(sourceLabel, `agent:${randomUUID()}`) : undefined;
    const callerTab = managers.tab.byLabel(label);
    if (!callerTab) throw new Error(`Agent caller not found: ${label}`);
    let run;
    try {
      run = managers.agent.create({
      caller: {
        ...caller.caller,
        incarnation: caller.caller.incarnation ?? randomUUID(),
      },
      snapshot,
      command: commandText,
      model: launch.model,
      effort: launch.effort,
      ...(releaseWorkspace !== undefined && { releaseWorkspace }),
      });
    } catch (error) {
      await releaseWorkspace?.();
      throw error;
    }
    if (launch.inTab) {
      try {
        const monitorPlugin = managers.plugins.declarations.find((declaration) => declaration.agentMonitor === true);
        if (!monitorPlugin) throw new Error('Agent: no monitoring plugin is available.');
        const taskName = snapshot.taskPath.split('/').at(-1) ?? snapshot.taskPath;
        managers.tab.openPluginTab(monitorPlugin.id, monitorPlugin.tabLabelPrefix, run.id,
          monitorPlugin.payloadSchemaVersion, label, () => ({
          title: `Agent: ${taskName}`,
          payload: { runId: run.id },
        }));
        const monitor = managers.tab.pluginTabByInstanceKey(monitorPlugin.id, run.id);
        if (!monitor) throw new Error('Agent: could not open monitoring tab.');
        monitor.plugin.agentRunId = run.id;
        managers.agent.attachMonitor(run.id, monitor.label);
      } catch (error) {
        await Promise.allSettled([managers.agent.finish(run.id, 'failed')]);
        throw error;
      }
    }
    const runInvocation: CommandInvocationContext = Object.freeze({
      ...caller,
      runId: run.id,
      caller: run.caller,
      signal: run.abortController.signal,
    });
    const abortRun = () => { void managers.agent.finish(run.id, 'terminated').catch(() => {}); };
    caller.signal.addEventListener('abort', abortRun, { once: true });
    let result: AgentResult;
    try {
      result = await executeAgentRun(run, runInvocation, launch.model, launch.effort, launch.parameters, managers,
        useRemote && remoteChannel ? { channel: remoteChannel, offline: sourceTab?.offline } : undefined);
    } catch (error) {
      result = agentFailure(error);
    }

    const cleanupWarnings: string[] = [];
    run.setStatus('Cleaning up', result.response);
    try {
      if (managers.agent.runs.has(run.id)) await managers.agent.finish(run.id, result.status);
      else await run.finish(run.outcome ?? result.status);
    } catch (error) {
      const errors = error instanceof AggregateError ? error.errors : [error];
      cleanupWarnings.push(...errors.map((failure) => failure instanceof Error ? failure.message : String(failure)));
    }
    if (run.outcome === 'terminated') {
      result = { ...result, status: 'terminated', response: 'Agent terminated.' };
    }
    caller.signal.removeEventListener('abort', abortRun);
    return { ...result, cleanupWarnings: [...result.cleanupWarnings, ...cleanupWarnings] };
  } catch (error) {
    return agentFailure(error);
  }
}

export const command: Command = {
  name: 'agent',
  match: (command_) => /^agent\b/i.test(command_),
  structuredResult: true,
  samples: ['agent execute task.md', 'agent with skill ask-user execute task.md'],
  run: async (commandText, tab, managers, invocation) => {
    const caller = invocationFor(tab.label, managers, invocation);
    const result = await runAgent(commandText, tab.label, managers, caller);
    const current = managers.tab.byLabel(tab.label);
    if (current?.runtime?.incarnation === caller.caller.incarnation) {
      appendCommandOutput(managers, tab.label, { input: commandText, output: formatResult(result) }, caller);
    }
    return result;
  },
};
