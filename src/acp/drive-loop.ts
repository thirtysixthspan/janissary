import type { AcpLoopHandlers, AcpLoopSession, AcpRunSnapshot, AcpToolHost } from './types.js';
import type { RemoteAcpSession } from '../remote/acp-session.js';
import { createAcpToolTable, gateCommand, toolExtractor, toolPrimer, type AcpTool } from './tool-table.js';
import { runAcpToolLoop } from './loop.js';
import { NO_BUILTIN_TOOLS_LINE, NO_TOOLS_LINE } from './internal-tools.js';
import { MARKDOWN_INSTRUCTION } from './launch.js';
import { NATIVE_ACP_COMMANDS } from '../plugins/roles/shared.js';
import { extractAgentCommand } from '../agent/command-extract.js';
import { describeLoopCommand } from '../file-write/command.js';

const TELL_INSTRUCTION = 'The user is instructing you to carry out a task. Do it with the commands available to you, then briefly report what you did.';

export function corePrimer(snapshot: Extract<AcpRunSnapshot, { kind: 'core' }>, tools: AcpTool[]): string {
  const allowList = NATIVE_ACP_COMMANDS.filter((command) => snapshot.grants.includes(command)
    && snapshot.rows.find((row) => row.name === command)?.effectiveAgentAccess !== false);
  const toolsAvailable = tools.length > 0 && allowList.length > 0;
  return [
    toolPrimer(tools, allowList),
    toolsAvailable ? NO_BUILTIN_TOOLS_LINE : NO_TOOLS_LINE,
    snapshot.role === 'tell' ? TELL_INSTRUCTION : '',
    MARKDOWN_INSTRUCTION,
  ].filter(Boolean).join('\n\n');
}

export const CORE_MAX_STEPS = 8;

type DrivenStep = { workspace: boolean; refused?: 'disabled' };

async function settleUnlessAborted(result: Promise<string>, signal: AbortSignal): Promise<string> {
  try {
    return await result;
  } catch (error) {
    if (signal.aborted) return '';
    throw error;
  }
}

function dropLateRejection(result: string | Promise<string>, signal: AbortSignal): string | Promise<string> {
  return result instanceof Promise ? settleUnlessAborted(result, signal) : result;
}

function gatedRunner(
  snapshot: AcpRunSnapshot, tools: readonly AcpTool[], host: AcpToolHost, events: AcpLoopHandlers,
  remember: (step: DrivenStep) => void, signal: AbortSignal,
): (command: string) => string | Promise<string> {
  return (command) => {
    const decision = gateCommand(snapshot, tools, command);
    if ('refusal' in decision) {
      remember({ workspace: false, ...(decision.refused !== undefined && { refused: decision.refused }) });
      events.startCommand?.(command, false);
      return decision.refusal;
    }
    const workspace = decision.runsOn === 'workspace';
    remember({ workspace });
    events.startCommand?.(command, workspace);
    return dropLateRejection(workspace ? host.runWorkspace(command) : host.runCaller(command), signal);
  };
}

export function driveToolLoop(
  session: AcpLoopSession, prompt: string, snapshot: AcpRunSnapshot,
  host: AcpToolHost, events: AcpLoopHandlers, signal: AbortSignal,
): void {
  const tools: AcpTool[] = snapshot.kind === 'core' && !snapshot.withoutTools ? createAcpToolTable(snapshot.grants) : [];
  let step: DrivenStep = { workspace: false };
  const runCommand = gatedRunner(snapshot, tools, host, events, (next) => { step = next; }, signal);
  runAcpToolLoop(session, prompt, {
    signal,
    primer: snapshot.kind === 'core' ? corePrimer(snapshot, tools) : MARKDOWN_INSTRUCTION,
    runCommand,
    extractCommand: snapshot.kind === 'core' ? toolExtractor(tools) : (text) => extractAgentCommand(text, snapshot.askUser),
    maxSteps: snapshot.kind === 'core' ? CORE_MAX_STEPS : Infinity,
    describeCommand: describeLoopCommand,
  }, {
    startTurn: (isFirst) => { events.startTurn(isFirst); },
    chunk: (cumulative) => { events.chunk(cumulative); },
    endTurn: (final) => { events.endTurn(final); },
    ranCommand: (command, result) => { events.ranCommand(command, result, step.workspace, step.refused); },
    finished: (reason, maxSteps) => { events.finished(reason, maxSteps); },
    error: (message) => { events.error(message); },
  });
}

export function runToolLoop(
  session: AcpLoopSession | RemoteAcpSession, prompt: string, snapshot: AcpRunSnapshot,
  host: AcpToolHost, events: AcpLoopHandlers, signal: AbortSignal,
): void {
  if ('remote' in session) {
    if (signal.aborted) return;
    session.run(prompt, snapshot, host.runCaller, events);
    return;
  }
  driveToolLoop(session, prompt, snapshot, host, events, signal);
}
