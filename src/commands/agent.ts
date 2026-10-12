import { randomUUID } from 'node:crypto';
import type { Command, CommandInvocationContext, CommandManagers } from './types.js';
import { commands } from './index.js';
import { parseAgentCommand } from '../agent/command-parser.js';
import { resolveAgentSnapshot } from '../agent/task-resolution.js';
import { janissaryRoot } from '../janissary-root.js';
import { agentFailure, executeAgentRun, type AgentResult } from '../agent/execute.js';
import { appendCommandOutput } from '../command/append.js';
import { startLocalAgentRun } from '../agent/workspace-execution.js';
import { invocationFor } from './agent-invocation.js';
import type { AgentSnapshot } from '../agent/types.js';
import { applyNestedAgentPolicy } from '../agent/nested-policy.js';
import { createRunCompletion, trackChildRun, trustedParentRun } from '../agent/nested-run.js';
import { formatAgentResult } from '../agent/format-result.js';
import { resolveAgentGroup } from '../agent/group-selector.js';
import { inheritRemoteAgentTarget, resolveRemoteAgentTarget, type RemoteAgentTarget } from '../agent/remote-target.js';

async function runAgent(
  commandText: string,
  label: string,
  managers: CommandManagers,
  invocation?: CommandInvocationContext,
): Promise<AgentResult> {
  const completion = createRunCompletion();
  const launch = parseAgentCommand(commandText);
  if ('error' in launch) return { status: 'failed', response: launch.error, cleanupWarnings: [] };
  let run: ReturnType<CommandManagers['agent']['create']> | undefined;
  let caller: CommandInvocationContext | undefined;
  let abortRun: (() => void) | undefined;
  try {
    caller = invocationFor(label, managers, invocation);
    if (caller.signal.aborted) return { status: 'terminated', response: 'Agent terminated.', cleanupWarnings: [] };
    const selectedGroup = resolveAgentGroup(managers.tab.tabs, launch.group);
    const parent = trustedParentRun(caller, managers);
    const sourceLabel = launch.workspace ?? label;
    const callerTab = managers.tab.byLabel(label);
    if (!callerTab) throw new Error(`Agent caller not found: ${label}`);
    const sourceTab = managers.tab.byLabel(sourceLabel);
    const remoteAddress = managers.remote.addressOf(sourceLabel);
    if (launch.workspace && (!sourceTab || !remoteAddress)) {
      throw new Error(`remote workspace "${launch.workspace}" is not available.`);
    }
    let remoteTarget: RemoteAgentTarget | undefined;
    if (launch.host) remoteTarget = await resolveRemoteAgentTarget(managers, launch.host, sourceLabel, caller.caller.cwd, caller.signal);
    else if (launch.workspace || remoteAddress) remoteTarget = await inheritRemoteAgentTarget(managers, sourceLabel);
    const capturedCaller = {
      ...caller.caller,
      incarnation: caller.caller.incarnation ?? randomUUID(),
    };
    let snapshot: AgentSnapshot;
    let executionDir = caller.caller.cwd;
    if (remoteTarget) {
      const releaseWorkspace = remoteTarget.release;
      const placeholder: AgentSnapshot = { taskPath: launch.task, taskText: '', skills: [], grants: [] };
      try {
        run = managers.agent.create({
          caller: capturedCaller,
          snapshot: placeholder,
          executionDir,
          executionHost: remoteTarget.host,
          executionWorkspace: remoteTarget.workspace,
          command: commandText,
          model: launch.model,
          effort: launch.effort,
          releaseWorkspace,
        });
      } catch (error) {
        await releaseWorkspace();
        throw error;
      }
      if (parent) trackChildRun(parent, run, managers, completion.promise);
      abortRun = () => { void managers.agent.finish(run!.id, 'terminated').catch(() => {}); };
      caller.signal.addEventListener('abort', abortRun, { once: true });
      snapshot = await remoteTarget.channel.resolveAgentSnapshot(launch.task, [...launch.skills]);
    } else {
      const local = await startLocalAgentRun(managers, capturedCaller, commandText, launch.model, launch.effort);
      run = local.run;
      if (parent) trackChildRun(parent, run, managers, completion.promise);
      executionDir = local.workspace.dir;
      abortRun = () => { void managers.agent.finish(run!.id, 'terminated').catch(() => {}); };
      caller.signal.addEventListener('abort', abortRun, { once: true });
      await local.workspace.ready;
      if (run.abortController.signal.aborted) {
        const cleanupWarnings: string[] = [];
        try { await managers.agent.finish(run.id, 'terminated'); }
        catch (error) {
          const failures = error instanceof AggregateError ? error.errors : [error];
          cleanupWarnings.push(...failures.map((failure) => failure instanceof Error ? failure.message : String(failure)));
        }
        return { status: 'terminated', response: 'Agent terminated.', cleanupWarnings };
      }
      snapshot = resolveAgentSnapshot(launch.task, launch.skills, {
        workspaceDir: executionDir,
        installationDir: janissaryRoot(),
      }, commands.map(({ name }) => name));
    }
    if (!run) throw new Error('Agent run was not created.');
    if (parent) snapshot = applyNestedAgentPolicy(snapshot, parent.snapshot);
    run.setSnapshot(snapshot);
    const activeRun = run;
    if (launch.inTab) {
      try {
        const monitorPlugin = managers.plugins.declarations.find((declaration) => declaration.agentMonitor === true);
        if (!monitorPlugin) throw new Error('Agent: no monitoring plugin is available.');
        const taskName = snapshot.taskPath.split('/').at(-1) ?? snapshot.taskPath;
        managers.tab.openPluginTab(monitorPlugin.id, monitorPlugin.tabLabelPrefix, activeRun.id,
          monitorPlugin.payloadSchemaVersion, label, () => ({
          title: `Agent: ${taskName}`,
          payload: { runId: activeRun.id },
        }), selectedGroup ? { group: selectedGroup.name } : undefined);
        const monitor = managers.tab.pluginTabByInstanceKey(monitorPlugin.id, activeRun.id);
        if (!monitor) throw new Error('Agent: could not open monitoring tab.');
        monitor.plugin.agentRunId = activeRun.id;
        managers.agent.attachMonitor(activeRun.id, monitor.label);
      } catch (error) {
        const cleanupWarnings: string[] = [];
        try { await managers.agent.finish(activeRun.id, 'failed'); }
        catch (cleanupError) {
          const errors = cleanupError instanceof AggregateError ? cleanupError.errors : [cleanupError];
          cleanupWarnings.push(...errors.map((failure) => failure instanceof Error ? failure.message : String(failure)));
        }
        const result = agentFailure(error);
        return { ...result, cleanupWarnings: [...result.cleanupWarnings, ...cleanupWarnings] };
      }
    }
    const runInvocation: CommandInvocationContext = Object.freeze({
      ...caller,
      runId: activeRun.id,
      caller: activeRun.caller,
      signal: activeRun.abortController.signal,
    });
    let result: AgentResult;
    try {
      result = await executeAgentRun(activeRun, runInvocation, launch.model, launch.effort, launch.parameters, managers,
        remoteTarget ? { channel: remoteTarget.channel, offline: sourceTab?.offline } : undefined);
    } catch (error) {
      result = agentFailure(error);
    }

    const cleanupWarnings: string[] = [];
    if (activeRun.outcome === undefined) activeRun.setStatus('Cleaning up', result.response);
    try {
      if (managers.agent.runs.has(activeRun.id)) await managers.agent.finish(activeRun.id, result.status);
      else await activeRun.finish(activeRun.outcome ?? result.status);
    } catch (error) {
      const errors = error instanceof AggregateError ? error.errors : [error];
      cleanupWarnings.push(...errors.map((failure) => failure instanceof Error ? failure.message : String(failure)));
    }
    if (activeRun.outcome === 'terminated') {
      result = { ...result, status: 'terminated', response: 'Agent terminated.' };
    }
    return { ...result, cleanupWarnings: [...result.cleanupWarnings, ...cleanupWarnings] };
  } catch (error) {
    const cleanupWarnings: string[] = [];
    if (run && managers.agent.runs.has(run.id)) {
      try { await managers.agent.finish(run.id, run.abortController.signal.aborted ? 'terminated' : 'failed'); }
      catch (cleanupError) {
        const errors = cleanupError instanceof AggregateError ? cleanupError.errors : [cleanupError];
        cleanupWarnings.push(...errors.map((failure) => failure instanceof Error ? failure.message : String(failure)));
      }
    }
    if (run) {
      try { await run.finish(run.outcome ?? 'failed'); } catch { /* cleanup warnings were collected above */ }
    }
    if (cleanupWarnings.length > 0) {
      const result = run?.outcome === 'terminated'
        ? { status: 'terminated' as const, response: 'Agent terminated.', cleanupWarnings: [] }
        : agentFailure(error);
      return { ...result, cleanupWarnings };
    }
    if (run?.outcome === 'terminated') return { status: 'terminated', response: 'Agent terminated.', cleanupWarnings: [] };
    return agentFailure(error);
  } finally {
    if (caller && abortRun) caller.signal.removeEventListener('abort', abortRun);
    completion.resolve();
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
      appendCommandOutput(managers, tab.label, { input: commandText, output: formatAgentResult(result) }, caller);
    }
    return result;
  },
};
