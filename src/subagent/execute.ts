import type { CommandInvocationContext } from '../commands/types.js';
import type { Managers } from '../managers.js';
import type { AgentRun, AgentOutcome } from '../agent/run.js';
import { attemptOrder, exhaustedError, fallbackNotice, type AcpRoleSettings, type AttemptFailure } from '../acp/ask-role.js';
import type { CommandSettingsSnapshot } from '../native-commands/settings-types.js';
import type { RoleEntry } from '../plugins/roles/shared.js';
import { runSubagentEntry, type SubagentAttemptResult } from './attempt.js';
import type { SubagentAttemptRemote } from './attempt-session.js';
import { createSubagentSessionSlot, type SubagentSessionSlot } from './execute-session.js';

export type SubagentExecutionOptions = Readonly<{
  run: AgentRun;
  invocation: CommandInvocationContext;
  managers: Managers;
  settings: AcpRoleSettings;
  entries: readonly [RoleEntry, ...RoleEntry[]];
  executionDir: string;
  context?: string;
  offline?: boolean;
  remote?: SubagentAttemptRemote;
  onStarted?: (sessionId: string) => void;
}>;

export type SubagentExecutionResult = Readonly<{
  status: AgentOutcome;
  response: string;
  sessionId: string | null;
  cleanupWarnings: readonly string[];
}>;

type Captured = Readonly<{
  settings: AcpRoleSettings;
  order: readonly RoleEntry[];
  nativeSettings: CommandSettingsSnapshot | undefined;
  interrupted: boolean;
}>;

function ended(run: AgentRun, slot: SubagentSessionSlot | undefined): boolean {
  return run.outcome !== undefined || run.abortController.signal.aborted || (slot !== undefined && slot.closed);
}

function capture(options: SubagentExecutionOptions): Captured {
  const { run, managers, settings } = options;
  const before = ended(run, undefined);
  const entries = options.entries.map((entry) => ({ ...entry }));
  const copied: AcpRoleSettings = {
    name: settings.name,
    entries: settings.entries.map((entry) => ({ ...entry })),
    commands: [...settings.commands],
  };
  const order = attemptOrder(entries);
  const nativeSettings = before ? undefined : managers.nativeCommandSettings?.current();
  return {
    settings: copied, order, nativeSettings,
    interrupted: before || ended(run, undefined),
  };
}

function result(
  status: AgentOutcome, response: string, sessionId: string | null, warnings: readonly string[],
): SubagentExecutionResult {
  return { status, response, sessionId, cleanupWarnings: [...warnings] };
}

function terminated(sessionId: string | null, warnings: readonly string[]): SubagentExecutionResult {
  return result('terminated', 'Subagent terminated.', sessionId, warnings);
}

function stop(
  run: AgentRun, slot: SubagentSessionSlot, attempt: SubagentAttemptResult,
  sessionId: string | null, warnings: readonly string[],
): SubagentExecutionResult | undefined {
  if (ended(run, slot) || attempt.status === 'terminated') return terminated(sessionId, warnings);
  if (attempt.status === 'completed' || attempt.status === 'partial') {
    return result(attempt.status, attempt.response, sessionId, warnings);
  }
  if (attempt.replied) return result('failed', attempt.response, sessionId, warnings);
  return undefined;
}

export async function executeSubagentRun(options: SubagentExecutionOptions): Promise<SubagentExecutionResult> {
  const { run, invocation, managers, executionDir, context, offline, remote, onStarted } = options;
  const captured = capture(options);
  if (captured.interrupted) return terminated(null, []);
  const { settings, order, nativeSettings } = captured;

  const slot = createSubagentSessionSlot(run);
  const warnings: string[] = [];
  const failures: AttemptFailure[] = [];
  let latestSessionId: string | null = null;
  let firstStarted = false;
  let activeToken: object | undefined;

  const observe = (token: object, id: string): void => {
    if (token !== activeToken) return;
    latestSessionId = id;
    if (firstStarted) return;
    firstStarted = true;
    onStarted?.(id);
  };

  let previous: RoleEntry | undefined;
  for (let index = 0; index < order.length; index += 1) {
    if (ended(run, slot)) return terminated(latestSessionId, warnings);
    const entry = order[index];
    const token = {};
    activeToken = token;
    const execution = runSubagentEntry({
      run, invocation, managers, settings, entry, executionDir, context, offline, nativeSettings, remote,
      adoptSession: slot.adoptSession,
      onSessionStarted: (id) => observe(token, id),
    });
    if (previous !== undefined && !ended(run, slot)) {
      run.reportActivity('message', fallbackNotice(previous, entry));
    }
    const attempt = await execution;
    activeToken = undefined;
    warnings.push(...attempt.cleanupWarnings);
    slot.clearAfterResult();
    const final = stop(run, slot, attempt, latestSessionId, warnings);
    if (final !== undefined) return final;
    failures.push({ entry, error: attempt.response });
    if (index === order.length - 1) {
      const response = failures.length === 1 ? attempt.response : exhaustedError(failures, settings.name);
      return result('failed', response, latestSessionId, warnings);
    }
    previous = entry;
  }
  return terminated(latestSessionId, warnings);
}
