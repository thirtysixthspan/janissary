import type { Managers } from '../managers.js';
import type { AcpLoopSession, AcpRunSnapshot, AcpRunSnapshotRow, AcpSession, AcpToolHost } from './types.js';
import type { RemoteAcpSession } from '../remote/acp-session.js';
import type { AcpPendingPrompt } from './prompt-state.js';
import type { AcpRole } from './role.js';
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
import { grepFilesInTab } from '../file-grep/tab-grep.js';
import { isFileGrepCommandLine } from '../file-grep/command.js';
import { isFileListCommandLine } from '../file-list/command.js';
import { listFilesInTab } from '../file-list/tab-list.js';
import { isFileStatCommandLine } from '../file-stat/command.js';
import { statFileInTab } from '../file-stat/tab-stat.js';
import { isFileExistsCommandLine } from '../file-exists/command.js';
import { fileExistsInTab } from '../file-exists/tab-exists.js';
import { isFileHeadTailCommandLine } from '../file-head-tail/command.js';
import { headTailInTab } from '../file-head-tail/tab-head-tail.js';
import { isWebCommandLine } from '../web/command-line.js';
import { runWebInTab } from '../web/tab-web.js';
import { coreActivity, promptCoreRecord, replyCoreRecord } from './record-feed.js';
import type { AcpSessionRecords } from '../acp-records/manager.js';
import { acpRoleRuntime } from './role-state.js';
import { NATIVE_ACP_COMMANDS } from '../plugins/roles/shared.js';
import { effectiveCommandSetting } from '../native-commands/policy.js';
import type { CommandSettingsSnapshot } from '../native-commands/settings-types.js';
import { corePrimer, runToolLoop } from './drive-loop.js';
import { createAcpToolTable } from './tool-table.js';

export function coreSnapshotRows(settings: CommandSettingsSnapshot | undefined): AcpRunSnapshotRow[] {
  if (settings === undefined) return [];
  return NATIVE_ACP_COMMANDS.map((name) => {
    const setting = effectiveCommandSetting(settings, name);
    return { name, effectiveEnabled: setting.effectiveEnabled, effectiveAgentAccess: setting.effectiveAgentAccess };
  });
}

function coreSnapshot(
  runtime: TabRuntime, request: AcpPendingPrompt, settings: CommandSettingsSnapshot | undefined,
): Extract<AcpRunSnapshot, { kind: 'core' }> {
  return {
    kind: 'core',
    role: request.role,
    roleName: request.roleName,
    grants: request.commands,
    rows: coreSnapshotRows(settings),
    withoutTools: runtime.acpWithoutTools === true,
  };
}

export function corePromptPrimer(
  runtime: TabRuntime, request: AcpPendingPrompt, settings: CommandSettingsSnapshot | undefined,
): string {
  const snapshot = coreSnapshot(runtime, request, settings);
  const tools = snapshot.withoutTools ? [] : createAcpToolTable(snapshot.grants);
  return corePrimer(snapshot, tools);
}

export function prepareCorePromptRecord(
  records: AcpSessionRecords, runtime: TabRuntime, request: AcpPendingPrompt,
  settings: CommandSettingsSnapshot | undefined,
): void {
  request.preamble = corePromptPrimer(runtime, request, settings);
  promptCoreRecord(records, runtime, request);
}

async function dispatchNative(
  managers: Managers,
  label: string,
  command: string,
  role: AcpRole,
  signal?: AbortSignal,
): Promise<string> {
  const invocation = createInvocationContext(managers, label, command, {
    ...(signal !== undefined && { signal }),
    awaitResult: true,
    acpTool: true,
    acpRole: role,
  });
  const result = await managers.command.dispatchNativeLine(label, command, invocation);
  if (!result.dispatched) throw new Error(`No ACP tool matched command: ${command}`);
  if (typeof result.result === 'string') return result.result;
  if (result.coreResponse) return result.output;
  if (result.result === undefined) return result.output;
  return JSON.stringify(result.result) ?? String(result.result);
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
  const roleState = request.state ?? acpRoleRuntime(runtime, request.role);
  const active = () => current() && roleState.prompt === request && !request.abort.signal.aborted;
  const updateRunning = (output: string, running: boolean) => {
    managers.tab.updateRunning(label, { markdown: true, entries: request.runningEntries }, output, running, { trailing: true });
  };
  const snapshot = coreSnapshot(runtime, request, nativeSettings);
  const recordTool = (text: string, toolPhase?: 'command' | 'reply', toolCommand?: string) =>
    coreActivity(managers.acpRecords, runtime, 'tool', text, request.role, toolPhase, toolCommand, request.state);
  const host: AcpToolHost = {
    runCaller: (command) => {
      if (!active()) throw new Error('ACP: prompt cancelled.');
      return dispatchNative(managers, label, command, request.role, request.abort.signal);
    },
    runWorkspace: (command) => {
      if (!active()) throw new Error('ACP: prompt cancelled.');
      const normalized = command.trim().replace(/^\//, '');
      if (isWebCommandLine(normalized)) return runWebInTab(managers, label, command, request.abort.signal);
      if (isFileMutationCommandLine(normalized)) return mutateFileInTab(managers, label, command);
      if (isFileGlobCommandLine(normalized)) return globFilesInTab(managers, label, command, request.abort.signal);
      if (isFileGrepCommandLine(normalized)) return grepFilesInTab(managers, label, command);
      if (isFileListCommandLine(normalized)) return listFilesInTab(managers, label, command);
      if (isFileStatCommandLine(normalized)) return statFileInTab(managers, label, command);
      if (isFileExistsCommandLine(normalized)) return fileExistsInTab(managers, label, command);
      if (isFileHeadTailCommandLine(normalized)) return headTailInTab(managers, label, command);
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
    endTurn: (final) => {
      updateRunning(final, false);
      lastAnswer = final;
      request.replied = true;
      replyCoreRecord(managers.acpRecords, runtime, final, request.role, request.state);
    },
    startCommand: (command, workspace) => { recordTool(tagged(command, workspace), 'command'); },
    ranCommand: (command, result, workspace, refused) => {
      if (refused === 'disabled') notify(managers, 'command-disabled', label, result);
      recordTool(tagged(result, workspace), 'reply', tagged(command, workspace));
      appendAcp(managers, label, { input: tagged(command, workspace), output: result, acp: true });
    },
    finished: (reason, maxSteps) => {
      notify(managers, 'state-change', label);
      if (isRateLimitError(lastAnswer)) notify(managers, 'rate-limited', label);
      messageBus.emit('state', { type: 'dirty' });
      if (reason === 'failed') return;
      const reply = reason === 'capped'
        ? `${lastAnswer}${lastAnswer ? '\n\n' : ''}(stopped after ${maxSteps} tool steps)`
        : lastAnswer;
      settleAcpPrompt(managers, label, { answered: true, reply, session: identity }, undefined, request.role, request.state);
    },
    error: (message) => {
      const error = `ACP error: ${message}`;
      updateRunning(error, false);
      notify(managers, 'state-change', label);
      if (isRateLimitError(message)) notify(managers, 'rate-limited', label);
      request.modelFailed = true;
      settleAcpPrompt(managers, label, { answered: false, error }, undefined, request.role, request.state);
    },
  }, active), request.abort.signal);
}
