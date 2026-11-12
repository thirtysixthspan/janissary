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
import { coreActivity } from './record-feed.js';
import { acpRoleRuntime } from './role-state.js';
import { NATIVE_ACP_COMMANDS } from '../plugins/roles/shared.js';
import { effectiveCommandSetting } from '../native-commands/policy.js';
import { runToolLoop } from './drive-loop.js';

// The prompt's gate authority, read once: a settings change mid-prompt takes effect from the next one.
function coreSnapshot(
  managers: Managers, runtime: TabRuntime, request: AcpPendingPrompt,
): Extract<AcpRunSnapshot, { kind: 'core' }> {
  const settings = managers.nativeCommandSettings?.current();
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
  session: AcpSession | RemoteAcpSession, identity: string, current: () => boolean,
): void {
  const roleState = acpRoleRuntime(runtime, request.role);
  const active = () => current() && roleState.prompt === request && !request.abort.signal.aborted;
  const updateRunning = (output: string, running: boolean) => {
    managers.tab.updateRunning(label, { markdown: true, entries: request.runningEntries }, output, running, { trailing: true });
  };
  const snapshot = coreSnapshot(managers, runtime, request);
  const recordTool = (text: string) => coreActivity(managers.acpRecords, runtime, 'tool', text, request.role);
  const host: AcpToolHost = {
    runCaller: (command) => {
      if (!active()) throw new Error('ACP: prompt cancelled.');
      return dispatchNative(managers, label, command, request.abort.signal);
    },
    runWorkspace: (command) => {
      if (!active()) throw new Error('ACP: prompt cancelled.');
      return readFileInTab(managers, label, command);
    },
  };
  let lastAnswer = '';
  const loopSession: AcpLoopSession | RemoteAcpSession = 'remote' in session
    ? session
    : guardedSession(session, active);
  runToolLoop(loopSession, request.prompt, snapshot, host, guardAcpHandlers({
    startTurn: (isFirst) => {
      if (isFirst) notify(managers, 'agent-start', label);
      const entry: LogEntry = { input: isFirst ? request.prompt : '', output: '', running: true, markdown: true };
      request.runningEntries.add(entry);
      appendAcp(managers, label, entry);
    },
    chunk: (buffer) => updateRunning(buffer, true),
    endTurn: (final) => { updateRunning(final, false); lastAnswer = final; request.replied = true; },
    startCommand: (command) => { recordTool(command); },
    ranCommand: (command, result, _workspace, refused) => {
      if (refused === 'disabled') notify(managers, 'command-disabled', label, result);
      recordTool(result);
      appendAcp(managers, label, { input: command, output: result, acp: true });
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
