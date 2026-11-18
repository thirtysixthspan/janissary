import type { CommandInvocationContext } from '../commands/types.js';
import type { Managers } from '../managers.js';
import type { AgentRun, AgentOutcome } from '../agent/run.js';
import type { AcpRoleSettings } from '../acp/ask-role.js';
import type { RoleEntry } from '../plugins/roles/shared.js';
import type { CommandSettingsSnapshot } from '../native-commands/settings-types.js';
import type { AcpSession, AcpPromptHandlers, AcpLoopSession, AcpRunSnapshot } from '../acp/types.js';
import { acpLaunchForEntry } from '../acp/launch.js';
import { runToolLoop } from '../acp/drive-loop.js';
import { guardAcpHandlers } from '../acp/guard-handlers.js';
import { coreSnapshotRows } from '../acp/run-prompt.js';
import { subagentTaskPrompt } from './primer.js';
import { errorText } from '../error-text.js';
import { openSubagentAttemptSession, type SubagentAttemptLease, type SubagentAttemptRemote } from './attempt-session.js';
import { createSubagentAttemptHost } from './attempt-host.js';

export type SubagentAttemptOptions = Readonly<{
  run: AgentRun;
  invocation: CommandInvocationContext;
  managers: Managers;
  settings: AcpRoleSettings;
  entry: RoleEntry;
  executionDir: string;
  context?: string;
  offline?: boolean;
  nativeSettings: CommandSettingsSnapshot | undefined;
  remote?: SubagentAttemptRemote;
  onSessionStarted?: (sessionId: string) => void;
  adoptSession?: (lease: SubagentAttemptLease) => void;
}>;

export type SubagentAttemptResult = Readonly<{
  status: AgentOutcome;
  response: string;
  replied: boolean;
  reason: 'answered' | 'capped' | 'error' | 'terminated';
  sessionId: string | null;
  cleanupWarnings: readonly string[];
}>;

type AttemptState = {
  active: () => boolean;
  reply: (text: string) => void;
  finish: (reason: 'answered' | 'capped') => void;
  fail: (message: string) => void;
  terminate: () => void;
  provider: (id: string) => void;
  activity: (kind: 'message' | 'thought' | 'tool' | 'plan' | 'permission', text: string) => void;
  toolActivity: (text: string, workspace: boolean | undefined) => void;
  warn: (error: unknown) => void;
  result: () => SubagentAttemptResult;
  onSettled: (fn: () => void) => void;
};

function createAttemptState(
  run: AgentRun, signal: AbortSignal, remote: SubagentAttemptRemote | undefined,
  onSessionStarted: ((id: string) => void) | undefined,
): AttemptState {
  let chosen = false;
  let status: AgentOutcome = 'failed';
  let response = '';
  let replied = false;
  let reason: SubagentAttemptResult['reason'] = 'error';
  let providerId: string | null = null;
  const cleanupWarnings: string[] = [];
  let settled: (() => void) | undefined;

  const choose = (next: { status: AgentOutcome; response: string; replied: boolean; reason: SubagentAttemptResult['reason'] }) => {
    if (chosen) return;
    chosen = true;
    status = next.status;
    response = next.response;
    replied = next.replied;
    reason = next.reason;
    settled?.();
  };
  const fail = (message: string) => choose({ status: 'failed', response: message, replied, reason: 'error' });
  return {
    active: () => !chosen && !run.outcome && !signal.aborted,
    reply: (text) => {
      if (chosen) return;
      replied = true;
      response = text;
    },
    finish: (r) => choose({ status: r === 'answered' ? 'completed' : 'partial', response, replied, reason: r }),
    fail,
    terminate: () => choose({ status: 'terminated', response: 'Subagent terminated.', replied: false, reason: 'terminated' }),
    provider: (id) => {
      providerId = id;
      if (onSessionStarted === undefined) return;
      try { onSessionStarted(id); }
      catch (error) { fail(errorText(error)); }
    },
    activity: (kind, text) => {
      if (chosen) return;
      run.reportActivity(kind, text);
    },
    toolActivity: (text, workspace) => {
      if (chosen) return;
      const tagged = remote !== undefined && workspace === true ? `[${remote.host}] ${text}` : text;
      run.record?.activity('tool', tagged);
    },
    warn: (error) => { cleanupWarnings.push(errorText(error)); },
    result: () => ({ status, response, replied, reason, sessionId: providerId, cleanupWarnings }),
    onSettled: (fn) => { settled = fn; if (chosen) fn(); },
  };
}

function attemptSnapshot(settings: AcpRoleSettings, nativeSettings: CommandSettingsSnapshot | undefined): Extract<AcpRunSnapshot, { kind: 'core' }> {
  return {
    kind: 'core',
    role: 'ask',
    roleName: settings.name,
    grants: settings.commands.filter((command) => command !== 'subagent'),
    rows: coreSnapshotRows(nativeSettings),
    withoutTools: false,
  };
}

function guardedSession(session: AcpSession, active: () => boolean): AcpLoopSession {
  return {
    prompt: (text, handlers: AcpPromptHandlers) => {
      if (!active()) return;
      session.prompt(text, {
        onChunk: (chunk) => { if (active()) handlers.onChunk(chunk); },
        onEnd: (reason) => { if (active()) handlers.onEnd(reason); },
        onError: (message) => { if (active()) handlers.onError(message); },
      });
    },
  };
}

export async function runSubagentEntry(options: SubagentAttemptOptions): Promise<SubagentAttemptResult> {
  const { run, invocation, managers, settings, entry, executionDir, context, offline, nativeSettings, remote, onSessionStarted, adoptSession } = options;
  const signal = run.abortController.signal;
  const state = createAttemptState(run, signal, remote, onSessionStarted);
  if (run.outcome || signal.aborted) {
    state.terminate();
    return state.result();
  }
  const endAllocation = run.beginAllocation();
  if (!endAllocation) {
    state.terminate();
    return state.result();
  }

  let disposeRequest: () => Promise<void> = async () => {};
  const abortListener = () => { state.terminate(); void disposeRequest(); };
  signal.addEventListener('abort', abortListener, { once: true });
  try {
    const launch = acpLaunchForEntry(entry);
    if (launch === undefined) {
      state.fail(`no ACP adapter for harness "${entry.harness}".`);
      return state.result();
    }
    const lease = openSubagentAttemptSession({
      launch, executionDir, runId: run.id, offline, remote,
      onDispose: (dispose) => { disposeRequest = dispose; },
      onError: (message) => state.fail(message),
      onSessionStarted: (id) => state.provider(id),
      onActivity: (activity) => state.activity(activity.kind, activity.text),
      onRemoteActivity: (kind, text) => state.activity(kind, text),
      onTerminated: () => state.terminate(),
      active: () => state.active(),
      adoptSession,
    });
    const prompt = subagentTaskPrompt(run.snapshot.taskText, context);
    run.record?.prompt(prompt);
    const snapshot = attemptSnapshot(settings, nativeSettings);
    const host = createSubagentAttemptHost({ run, invocation, managers, executionDir, active: () => state.active() });
    await new Promise<void>((resolve) => {
      state.onSettled(resolve);
      const loopSession: AcpLoopSession | { remote: true } = 'remote' in lease.session ? lease.session : guardedSession(lease.session, () => state.active());
      runToolLoop(loopSession as AcpLoopSession, prompt, snapshot, host, guardAcpHandlers({
        startTurn: () => {},
        chunk: () => {},
        endTurn: (text) => state.reply(text),
        startCommand: (command, workspace) => {
          state.toolActivity(command, workspace);
        },
        ranCommand: (_command, result, workspace) => {
          state.toolActivity(result, workspace);
        },
        finished: (reason) => state.finish(reason),
        error: (message) => state.fail(message),
      }, () => state.active()), signal);
    });
    return state.result();
  } catch (error) {
    state.fail(errorText(error));
    return state.result();
  } finally {
    signal.removeEventListener('abort', abortListener);
    try { await disposeRequest(); }
    catch (error) { state.warn(error); }
    endAllocation();
  }
}
