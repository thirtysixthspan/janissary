import type { Managers } from '../managers.js';
import type { AcpLoopSession, AcpRunSnapshot, AcpSession, AcpToolHost } from './types.js';
import type { RemoteAcpSession } from '../remote/acp-session.js';
import type { AcpPendingPrompt } from './prompt-state.js';
import type { LogEntry, TabRuntime } from '../tab/types.js';
import { guardAcpHandlers } from './guard-handlers.js';
import { appendAcp, settleAcpPrompt } from './response.js';
import { messageBus } from '../bus.js';
import { notify } from '../notifications/index.js';
import { isRateLimitError } from './rate-limit.js';
import { createInvocationContext } from '../command/invocation.js';
import { readFileInTab } from '../file-read/tab-read.js';
import { mutateFileInTab } from '../file-write/tab-write.js';
import { isFileMutationCommandLine } from '../file-write/command.js';
import { globFilesInTab } from '../file-glob/tab-glob.js';
import { isFileGlobCommandLine } from '../file-glob/command.js';
import { coreActivity } from './record-feed.js';
import { acpRoleRuntime } from './role-state.js';
import { NATIVE_ACP_COMMANDS } from '../plugins/roles/shared.js';
import { effectiveCommandSetting } from '../native-commands/policy.js';
import type { CommandSettingsSnapshot } from '../native-commands/settings-types.js';
import { runToolLoop } from './drive-loop.js';

function coreSnapshot(
  runtime: TabRuntime, request: AcpPendingPrompt, settings: CommandSettingsSnapshot | undefined,
): Extract<AcpRunSnapshot, { kind: 'core' }> {
  const rows = settings === undefined ? [] : NATIVE_ACP_COMMANDS.map((name) => {
    const setting = effectiveCommandSetting(settings, name);
    return { name, effectiveEnabled: setting.effectiveEnabled, effectiveAgentAccess: setting.effectiveAgentAccess };
  });
  return {
    kind: 'core',
    role: request.role,
    roleName: request.roleName,
    grants: request.commands,
    rows,
    withoutTools: runtime.acpWithoutTools === true,
  };
}

async function dispatchNative(
  managers: Managers,
  label: string,
  command: string,
  signal?: AbortSignal,
): Promise<string> {
  const invocation = createInvocationContext(managers, label, command, {
    ...(signal !== undefined && { signal }),
    awaitResult: true,
    acpTool: true,
  });
  const result = await managers.command.dispatchNativeLine(label, command, invocation);
  if (!result.dispatched) throw new Error(`No ACP tool matched command: ${command}`);
  if (result.coreResponse) return result.output;
  if (result.result === undefined) return result.output;
  return typeof result.result === 'string'
    ? result.result
    : JSON.stringify(result.result) ?? String(result.result);
}

function guardedSession(session: AcpSession, active: () => boolean): AcpLoopSession {
  return {
    prompt: (text, handlers) => {
      if (!active()) return;
      session.prompt(text, {
        onChunk: (chunk) => { if (active()) handlers.onChunk(chunk); },
        onEnd: (reason) => { if (active()) handlers.onEnd(reason); },
        onError: (message) => { if (active()) handlers.onError(message); },
      });
    },
  };
}

export function runCorePrompt(
  managers: Managers, label: string, runtime: TabRuntime, request: AcpPendingPrompt,
  nativeSettings: CommandSettingsSnapshot | undefined,
  session: AcpSession | RemoteAcpSession, identity: string, current: () => boolean,
): void {
  const roleState = acpRoleRuntime(runtime, request.role);
  const active = () => current() && roleState.prompt === request && !request.abort.signal.aborted;
  const updateRunning = (output: string, running: boolean) => {
    managers.tab.updateRunning(label, { markdown: true, entries: request.runningEntries }, output, running, { trailing: true });
  };
  const snapshot = coreSnapshot(runtime, request, nativeSettings);
  const recordTool = (text: string) => coreActivity(managers.acpRecords, runtime, 'tool', text, request.role);
  const host: AcpToolHost = {
    runCaller: (command) => {
      if (!active()) throw new Error('ACP: prompt cancelled.');
      return dispatchNative(managers, label, command, request.abort.signal);
    },
    runWorkspace: (command) => {
      if (!active()) throw new Error('ACP: prompt cancelled.');
      const normalized = command.trim().replace(/^\//, '');
      if (isFileMutationCommandLine(normalized)) return mutateFileInTab(managers, label, command);
      if (isFileGlobCommandLine(normalized)) return globFilesInTab(managers, label, command);
      return readFileInTab(managers, label, command);
    },
  };
  let lastAnswer = '';
  const loopSession: AcpLoopSession | RemoteAcpSession = 'remote' in session
    ? session
    : guardedSession(session, active);
  const remoteHost = 'remote' in session ? managers.tab.byLabel(label)?.remote?.host : undefined;
  const tagged = (text: string, workspace: boolean | undefined) =>
    remoteHost !== undefined && workspace === true ? `[${remoteHost}] ${text}` : text;
  runToolLoop(loopSession, request.prompt, snapshot, host, guardAcpHandlers({
    startTurn: (isFirst) => {
      if (isFirst) notify(managers, 'agent-start', label);
      const entry: LogEntry = { input: isFirst ? request.prompt : '', output: '', running: true, markdown: true };
      request.runningEntries.add(entry);
      appendAcp(managers, label, entry);
    },
    chunk: (buffer) => updateRunning(buffer, true),
    endTurn: (final) => { updateRunning(final, false); lastAnswer = final; request.replied = true; },
    startCommand: (command, workspace) => { recordTool(tagged(command, workspace)); },
    ranCommand: (command, result, workspace, refused) => {
      if (refused === 'disabled') notify(managers, 'command-disabled', label, result);
      recordTool(tagged(result, workspace));
      appendAcp(managers, label, { input: tagged(command, workspace), output: result, acp: true });
    },
    finished: (reason, maxSteps) => {
      notify(managers, 'state-change', label);
      if (isRateLimitError(lastAnswer)) notify(managers, 'rate-limited', label);
      const reply = reason === 'capped'
        ? `${lastAnswer}${lastAnswer ? '\n\n' : ''}(stopped after ${maxSteps} tool steps)`
        : lastAnswer;
      messageBus.emit('state', { type: 'dirty' });
      settleAcpPrompt(managers, label, { answered: true, reply, session: identity }, undefined, request.role);
    },
    error: (message) => {
      const error = `ACP error: ${message}`;
      updateRunning(error, false);
      notify(managers, 'state-change', label);
      if (isRateLimitError(message)) notify(managers, 'rate-limited', label);
      request.modelFailed = true;
      settleAcpPrompt(managers, label, { answered: false, error }, undefined, request.role);
    },
  }, active), request.abort.signal);
}
