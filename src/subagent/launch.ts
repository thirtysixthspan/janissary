import { randomUUID } from 'node:crypto';
import type { Managers } from '../managers.js';
import type { CommandInvocationContext } from '../commands/types.js';
import type { AcpRoleSettings } from '../acp/ask-role.js';
import type { RoleEntry } from '../plugins/roles/shared.js';
import type { AcpDispatchReceipt } from '../acp/response.js';
import type { AgentAcpCaller, AgentCaller, AgentRun } from '../agent/run.js';
import type { AgentSnapshot } from '../agent/types.js';
import type { AgentWorkspace } from '../agent/workspace-types.js';
import type { RemoteChannel } from '../remote/channel/index.js';
import { invocationFor } from '../agent/command-invocation.js';
import { tabRuntime } from '../tab/runtime.js';
import { startLocalAgentRun } from '../agent/workspace-execution.js';
import { resolveAgentSnapshot } from '../agent/task-resolution.js';
import { janissaryRoot } from '../janissary-root.js';
import { executeSubagentRun, type SubagentExecutionResult } from './execute.js';
import { prepareRemoteSubagentWorkspace, type RemoteSubagentWorkspace } from './remote-workspace.js';
import { createSubagentReplySink, type SubagentReplySink } from './replies.js';
import { settleSubagentRun } from './settle.js';

export type SubagentLaunchOptions = Readonly<{
  label: string;
  task: string;
  context?: string;
  commandText: string;
  invocation?: CommandInvocationContext;
  settings: AcpRoleSettings;
  entries: readonly [RoleEntry, ...RoleEntry[]];
}>;

type Continuation = Readonly<{
  run: AgentRun;
  managers: Managers;
  invocation: CommandInvocationContext;
  settings: AcpRoleSettings;
  entries: readonly [RoleEntry, ...RoleEntry[]];
  task: string;
  context?: string;
  workspace: AgentWorkspace | undefined;
  remote: RemoteSubagentWorkspace | undefined;
  channel: RemoteChannel | undefined;
  host: string | undefined;
  offline: boolean | undefined;
  sink: SubagentReplySink;
  onStarted: (id: string) => void;
  firstProviderId: () => string | null;
  executionReached: () => boolean;
  markReached: () => void;
}>;

async function terminatedResult(firstProviderId: () => string | null): Promise<SubagentExecutionResult> {
  return { status: 'terminated', response: 'Subagent terminated.', sessionId: firstProviderId(), cleanupWarnings: [] };
}

async function continueLaunch(ctx: Continuation): Promise<void> {
  const { run, managers, invocation, settings, entries, task, context, workspace, remote, channel, host, offline } = ctx;
  await settleSubagentRun({
    run, managers, sink: ctx.sink, firstProviderId: ctx.firstProviderId, executionReached: ctx.executionReached,
    execute: async () => {
      let directory: string;
      if (remote) directory = await remote.ready;
      else { await workspace!.ready; directory = workspace!.dir; }
      if (run.outcome !== undefined || run.abortController.signal.aborted) return terminatedResult(ctx.firstProviderId);
      let snapshot: AgentSnapshot;
      if (remote && channel) {
        snapshot = await channel.resolveAgentSnapshot(task, [], `subagent-${run.id}`);
        if (run.outcome !== undefined || run.abortController.signal.aborted) return terminatedResult(ctx.firstProviderId);
      } else {
        snapshot = resolveAgentSnapshot(task, [], { workspaceDir: directory, installationDir: janissaryRoot() }, []);
      }
      run.setSnapshot(snapshot);
      const execute = (): Promise<SubagentExecutionResult> => executeSubagentRun({
        run, invocation, managers, settings, entries, executionDir: directory, context, offline,
        ...(remote && channel && { remote: { channel, host: host ?? '', workspace: `subagent-${run.id}` } }),
        onStarted: ctx.onStarted,
      });
      ctx.markReached();
      return remote ? remote.trackExecution(execute) : execute();
    },
  });
}

export function launchSubagent(options: SubagentLaunchOptions, managers: Managers): AcpDispatchReceipt {
  const { label, task, context, commandText, settings, entries } = options;
  const invocation = invocationFor(label, managers, options.invocation);
  const tab = managers.tab.byLabel(label)!;
  const runtime = tabRuntime(tab);
  const incarnation = invocation.caller.incarnation ?? runtime.incarnation ?? randomUUID();
  const caller: AgentCaller = Object.freeze({
    label: invocation.caller.label,
    ownerName: tab.title ?? tab.label,
    incarnation,
    cwd: invocation.caller.cwd,
    context: Object.freeze([...invocation.caller.context]),
  });

  let acpCaller: AgentAcpCaller | undefined;
  if (invocation.acpTool === true) {
    const role = invocation.acpRole;
    const identity = role ? managers.acp.sessionIdentity(label, role) : undefined;
    const callerId = role ? managers.acp.providerSessionId(label, role) : undefined;
    if (!role || !identity || !callerId) throw new Error('Subagent: caller session is not available.');
    acpCaller = { role, sessionIdentity: identity, callerId };
  }

  const copiedSettings: AcpRoleSettings = {
    name: settings.name,
    entries: settings.entries.map((entry) => ({ ...entry })),
    commands: [...settings.commands],
  };
  const [firstSource, ...restSources] = entries;
  const first = { ...firstSource };
  const copiedEntries: [RoleEntry, ...RoleEntry[]] = [first, ...restSources.map((entry) => ({ ...entry }))];
  const line = invocation.line ?? commandText;
  const offline = tab.offline;

  const channel = managers.remote.get(label);
  const host = managers.remote.addressOf(label)?.host;
  const remote = channel ? prepareRemoteSubagentWorkspace(managers, channel, label) : undefined;
  let run: AgentRun;
  let workspace: AgentWorkspace | undefined;
  try {
    if (remote) {
      run = managers.agent.create({
        caller,
        snapshot: { taskPath: task, taskText: '', skills: [], grants: [] },
        executionHost: host,
        command: line,
        model: first.model,
        effort: first.effort ?? 'default',
        subagentRole: settings.name,
        releaseWorkspace: remote.release,
        ...(acpCaller && { acpCaller }),
      });
    } else {
      const local = startLocalAgentRun(managers, caller, line, task, first.model, first.effort ?? 'default', {
        fresh: true, subagentRole: settings.name, ...(acpCaller && { acpCaller }),
      });
      run = local.run;
      workspace = local.workspace;
    }
  } catch (error) {
    remote?.cancel();
    throw error;
  }
  remote?.start(run);

  const receipt: AcpDispatchReceipt = {
    replyId: randomUUID(), kind: 'record', recordId: run.recordId!, name: `subagent:${settings.name}`,
  };
  let firstId: string | null = null;
  let reached = false;
  const sink = createSubagentReplySink({
    managers, run, receipt, input: line, label, runtime, incarnation, role: settings.name, acpCaller,
  });

  queueMicrotask(() => {
    void continueLaunch({
      run, managers, invocation, settings: copiedSettings, entries: copiedEntries, task, context,
      workspace, remote, channel, host, offline, sink,
      onStarted: (id) => { firstId ??= id; sink.started(id); },
      firstProviderId: () => firstId,
      executionReached: () => reached,
      markReached: () => { reached = true; },
    }).catch(() => {});
  });
  return receipt;
}
