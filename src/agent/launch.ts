import { randomUUID } from 'node:crypto';
import type { CommandInvocationContext, CommandManagers } from '../commands/types.js';
import { resolveAgentSnapshot } from './task-resolution.js';
import { janissaryRoot } from '../janissary-root.js';
import { agentFailure, executeAgentRun, type AgentResult } from './execute.js';
import { startLocalAgentRun } from './workspace-execution.js';
import type { AgentLaunch, AgentSnapshot } from './types.js';
import { applyNestedAgentPolicy } from './nested-policy.js';
import { createRunCompletion, trackChildRun, trustedParentRun } from './nested-run.js';
import { resolveAgentGroup } from './group-selector.js';
import { resolveAgentLaunchTarget } from './launch-target.js';
import { settleAgentRun } from './settle-run.js';
import { openAgentMonitorTab } from './monitor-tab.js';
import { invocationFor } from './command-invocation.js';
import type { RemoteAgentTarget } from './remote-target.js';

function terminatedResult(cleanupWarnings: string[] = []): AgentResult {
  return { status: 'terminated', response: 'Agent terminated.', cleanupWarnings };
}

function assertCallerTabExists(label: string, managers: CommandManagers): void {
  if (!managers.tab.byLabel(label)) throw new Error(`Agent caller not found: ${label}`);
}

async function finishRunAfterError(
  run: ReturnType<CommandManagers['agent']['create']> | undefined,
  managers: CommandManagers,
  error: unknown,
): Promise<AgentResult> {
  if (!run) return agentFailure(error);
  const outcome = run.abortController.signal.aborted ? 'terminated' : 'failed';
  const cleanupWarnings = await settleAgentRun(run, outcome, managers);
  const result = run.outcome === 'terminated' ? terminatedResult() : agentFailure(error);
  return cleanupWarnings.length > 0 ? { ...result, cleanupWarnings } : result;
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

async function openRunMonitor(
  run: ReturnType<CommandManagers['agent']['create']>,
  launch: AgentLaunch,
  label: string,
  group: ReturnType<typeof resolveAgentGroup>,
  managers: CommandManagers,
): Promise<AgentResult | undefined> {
  if (!launch.inTab) return undefined;
  try {
    openAgentMonitorTab(run.id, run.snapshot.taskPath, label, group, managers);
    return undefined;
  } catch (error) {
    const cleanupWarnings = await settleAgentRun(run, 'failed', managers);
    const result = agentFailure(error);
    return { ...result, cleanupWarnings: [...result.cleanupWarnings, ...cleanupWarnings] };
  }
}

async function executeAgentRunSafely(
  run: ReturnType<CommandManagers['agent']['create']>,
  invocation: CommandInvocationContext,
  launch: AgentLaunch,
  managers: CommandManagers,
  remoteTarget: RemoteAgentTarget | undefined,
  offline: boolean | undefined,
): Promise<AgentResult> {
  try {
    return await executeAgentRun(run, invocation, launch.model, launch.effort, launch.parameters, managers,
      remoteTarget ? { channel: remoteTarget.channel, offline } : undefined);
  } catch (error) {
    return agentFailure(error);
  }
}

export async function launchAgent(
  launch: AgentLaunch,
  commandText: string,
  label: string,
  managers: CommandManagers,
  invocation: CommandInvocationContext | undefined,
  commandNames: readonly string[],
): Promise<AgentResult> {
  const completion = createRunCompletion();
  let run: ReturnType<CommandManagers['agent']['create']> | undefined;
  let caller: CommandInvocationContext | undefined;
  let abortRun: (() => void) | undefined;
  try {
    caller = invocationFor(label, managers, invocation);
    if (caller.signal.aborted) return terminatedResult();
    const selectedGroup = resolveAgentGroup(managers.tab.tabs, launch.group);
    const parent = trustedParentRun(caller, managers);
    assertCallerTabExists(label, managers);
    const target = resolveAgentLaunchTarget(managers, launch, label, caller.caller.cwd, caller.signal);
    const capturedCaller = {
      ...caller.caller,
      incarnation: caller.caller.incarnation ?? randomUUID(),
    };
    let snapshot: AgentSnapshot;
    let executionDir = caller.caller.cwd;
    let remoteTarget: RemoteAgentTarget | undefined;
    if (target.kind === 'remote') {
      remoteTarget = await target.target;
      try {
        run = managers.agent.create({
          caller: capturedCaller,
          snapshot: { taskPath: launch.task, taskText: '', skills: [], grants: [] },
          executionDir,
          executionHost: remoteTarget.host,
          executionWorkspace: remoteTarget.workspace,
          command: commandText,
          model: launch.model,
          effort: launch.effort,
          releaseWorkspace: remoteTarget.release,
        });
      } catch (error) {
        await remoteTarget.release();
        throw error;
      }
      abortRun = linkRunToCaller(run, parent, caller.signal, managers, completion.promise);
      snapshot = await remoteTarget.channel.resolveAgentSnapshot(launch.task, [...launch.skills]);
    } else {
      const local = await startLocalAgentRun(
        managers, capturedCaller, commandText, launch.model, launch.effort, target.workspaceName,
      );
      run = local.run;
      abortRun = linkRunToCaller(run, parent, caller.signal, managers, completion.promise);
      executionDir = local.workspace.dir;
      await local.workspace.ready;
      if (run.abortController.signal.aborted) {
        return terminatedResult(await settleAgentRun(run, 'terminated', managers));
      }
      snapshot = resolveAgentSnapshot(launch.task, launch.skills, {
        workspaceDir: executionDir,
        installationDir: janissaryRoot(),
      }, commandNames);
    }
    if (!run) throw new Error('Agent run was not created.');
    if (parent) snapshot = applyNestedAgentPolicy(snapshot, parent.snapshot);
    run.setSnapshot(snapshot);
    const activeRun = run;
    const monitorFailure = await openRunMonitor(activeRun, launch, label, selectedGroup, managers);
    if (monitorFailure) return monitorFailure;
    const runInvocation: CommandInvocationContext = Object.freeze({
      ...caller,
      runId: activeRun.id,
      caller: activeRun.caller,
      signal: activeRun.abortController.signal,
    });
    let result = await executeAgentRunSafely(
      activeRun, runInvocation, launch, managers, remoteTarget, target.sourceTab?.offline,
    );

    if (activeRun.outcome === undefined) activeRun.setStatus('Cleaning up', result.response);
    const cleanupWarnings = await settleAgentRun(activeRun, result.status, managers);
    if (activeRun.outcome === 'terminated') result = { ...result, status: 'terminated', response: 'Agent terminated.' };
    return { ...result, cleanupWarnings: [...result.cleanupWarnings, ...cleanupWarnings] };
  } catch (error) {
    return await finishRunAfterError(run, managers, error);
  } finally {
    if (caller && abortRun) caller.signal.removeEventListener('abort', abortRun);
    completion.resolve();
  }
}
