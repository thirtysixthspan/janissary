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
import type { AgentOutcome } from '../agent/run.js';
import type { TabGroup } from '../tab/groups.js';
import { applyNestedAgentPolicy } from '../agent/nested-policy.js';
import { createRunCompletion, trackChildRun, trustedParentRun } from '../agent/nested-run.js';
import { formatAgentResult } from '../agent/format-result.js';
import { resolveAgentGroup } from '../agent/group-selector.js';
import { inheritRemoteAgentTarget, resolveRemoteAgentTarget, type RemoteAgentTarget } from '../agent/remote-target.js';

function cleanupErrorMessages(error: unknown): string[] {
  const failures = error instanceof AggregateError ? error.errors : [error];
  return failures.map((failure) => failure instanceof Error ? failure.message : String(failure));
}

async function finishRunCollectingWarnings(runId: string, outcome: AgentOutcome, managers: CommandManagers): Promise<string[]> {
  try { await managers.agent.finish(runId, outcome); }
  catch (error) { return cleanupErrorMessages(error); }
  return [];
}

async function finishRunAfterError(
  run: ReturnType<CommandManagers['agent']['create']> | undefined,
  managers: CommandManagers,
  error: unknown,
): Promise<AgentResult> {
  if (!run) return agentFailure(error);
  const outcome = run.abortController.signal.aborted ? 'terminated' : 'failed';
  const cleanupWarnings = managers.agent.runs.has(run.id) ? await finishRunCollectingWarnings(run.id, outcome, managers) : [];
  try { await run.finish(run.outcome ?? 'failed'); } catch { /* cleanup warnings were collected above */ }
  const result = run.outcome === 'terminated'
    ? { status: 'terminated' as const, response: 'Agent terminated.', cleanupWarnings: [] }
    : agentFailure(error);
  return cleanupWarnings.length > 0 ? { ...result, cleanupWarnings } : result;
}

function openRunMonitorTab(
  runId: string, taskPath: string, label: string, group: TabGroup | undefined, managers: CommandManagers,
): void {
  const monitorPlugin = managers.plugins.declarations.find((declaration) => declaration.agentMonitor === true);
  if (!monitorPlugin) throw new Error('Agent: no monitoring plugin is available.');
  const taskName = taskPath.split('/').at(-1) ?? taskPath;
  managers.tab.openPluginTab(monitorPlugin.id, monitorPlugin.tabLabelPrefix, runId,
    monitorPlugin.payloadSchemaVersion, label, () => ({
    title: `Agent: ${taskName}`,
    payload: { runId },
  }), group ? { group: group.name } : undefined);
  const monitor = managers.tab.pluginTabByInstanceKey(monitorPlugin.id, runId);
  if (!monitor) throw new Error('Agent: could not open monitoring tab.');
  monitor.plugin.agentRunId = runId;
  managers.agent.attachMonitor(runId, monitor.label);
}

function linkRunToCaller(
  run: ReturnType<CommandManagers['agent']['create']>, parent: ReturnType<typeof trustedParentRun>,
  signal: AbortSignal, managers: CommandManagers, completion: Promise<void>,
): () => void {
  if (parent) trackChildRun(parent, run, managers, completion);
  const abortRun = () => { void managers.agent.finish(run.id, 'terminated').catch(() => {}); };
  signal.addEventListener('abort', abortRun, { once: true });
  return abortRun;
}

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
    const localWorkspaceName = launch.workspace && !launch.host
      && !managers.remote.addressOf(label) && !remoteAddress
      ? launch.workspace
      : undefined;
    if (launch.workspace && !localWorkspaceName && (!sourceTab || !remoteAddress)) {
      throw new Error(`remote workspace "${launch.workspace}" is not available.`);
    }
    let remoteTarget: RemoteAgentTarget | undefined;
    if (launch.host) remoteTarget = await resolveRemoteAgentTarget(managers, launch.host, sourceLabel, caller.caller.cwd, caller.signal);
    else if (!localWorkspaceName && (launch.workspace || remoteAddress)) remoteTarget = await inheritRemoteAgentTarget(managers, sourceLabel);
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
      abortRun = linkRunToCaller(run, parent, caller.signal, managers, completion.promise);
      snapshot = await remoteTarget.channel.resolveAgentSnapshot(launch.task, [...launch.skills]);
    } else {
      const local = await startLocalAgentRun(
        managers, capturedCaller, commandText, launch.model, launch.effort, localWorkspaceName,
      );
      run = local.run;
      abortRun = linkRunToCaller(run, parent, caller.signal, managers, completion.promise);
      executionDir = local.workspace.dir;
      await local.workspace.ready;
      if (run.abortController.signal.aborted) {
        const cleanupWarnings = await finishRunCollectingWarnings(run.id, 'terminated', managers);
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
        openRunMonitorTab(activeRun.id, snapshot.taskPath, label, selectedGroup, managers);
      } catch (error) {
        const cleanupWarnings = await finishRunCollectingWarnings(activeRun.id, 'failed', managers);
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
    } catch (error) { cleanupWarnings.push(...cleanupErrorMessages(error)); }
    if (activeRun.outcome === 'terminated') {
      result = { ...result, status: 'terminated', response: 'Agent terminated.' };
    }
    return { ...result, cleanupWarnings: [...result.cleanupWarnings, ...cleanupWarnings] };
  } catch (error) {
    // Awaited so the finally block resolves completion only after the run's cleanup settles.
    return await finishRunAfterError(run, managers, error);
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
