import type { AcpLoopHandlers, AcpLoopSession, AcpRunSnapshot, AcpToolHost } from './types.js';
import { getConfig } from '../config.js';
import { extractCommandBlock } from './command-block.js';
import type { RemoteAcpSession } from '../remote/acp-session.js';
import { createAcpToolTable, gateCommand, toolExtractor, toolPrimer, type AcpTool } from './tool-table.js';
import { runAcpToolLoop } from './loop.js';
import { DISABLED_HARNESS_TOOLS_LINE, NO_BUILTIN_TOOLS_LINE, NO_TOOLS_LINE } from './internal-tools.js';
import { MARKDOWN_INSTRUCTION } from './launch.js';
import { NATIVE_ACP_COMMANDS } from '../plugins/roles/shared.js';
import { describeLoopCommand } from '../file-write/command.js';
import { commandProtocolPrimer } from './command-protocol.js';

const TELL_INSTRUCTION = 'The user is instructing you to carry out a task. Gather all the input you need from your commands and execute all the tasks before providing a final summary message. The final summary must be a summary of the work that was done.';
const ASK_INSTRUCTION = 'Gather all the input you need from your commands before providing a final response. The final response must answer the question in the user prompt.';

export function maxToolSteps(): number {
  return getConfig().maxToolTurns;
}

export function corePrimer(snapshot: Extract<AcpRunSnapshot, { kind: 'core' }>, tools: AcpTool[]): string {
  const allowList = NATIVE_ACP_COMMANDS.filter((command) => snapshot.grants.includes(command)
    && snapshot.rows.find((row) => row.name === command)?.effectiveAgentAccess !== false);
  const toolsAvailable = tools.length > 0 && allowList.length > 0;
  return [
    toolPrimer(tools, allowList),
    toolsAvailable ? NO_BUILTIN_TOOLS_LINE : NO_TOOLS_LINE,
    toolsAvailable ? DISABLED_HARNESS_TOOLS_LINE : '',
    toolsAvailable ? commandProtocolPrimer(maxToolSteps()) : '',
    snapshot.role === 'tell' ? TELL_INSTRUCTION : '',
    toolsAvailable && snapshot.role === 'ask' ? ASK_INSTRUCTION : '',
    MARKDOWN_INSTRUCTION,
  ].filter(Boolean).join('\n\n');
}

type GateMeta = { workspace: boolean; refused?: 'disabled' };

// Metadata is paired with the command that produced it, not with a position in a shared queue, so a
// parallel batch can settle in any order without a result picking up another command's workspace or
// refusal flag. Repeated command strings keep their own FIFO so duplicates stay matched.
function metadataLedger() {
  const ledger = new Map<string, GateMeta[]>();
  return {
    add(command: string, meta: GateMeta): void {
      const entries = ledger.get(command);
      if (entries) entries.push(meta);
      else ledger.set(command, [meta]);
    },
    take(command: string): GateMeta | undefined {
      const entries = ledger.get(command);
      const meta = entries?.shift();
      if (entries?.length === 0) ledger.delete(command);
      return meta;
    },
  };
}

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
  record: (command: string, meta: GateMeta) => void, signal: AbortSignal,
): (command: string) => string | Promise<string> {
  return (command) => {
    const decision = gateCommand(snapshot, tools, command);
    if ('refusal' in decision) {
      record(command, { workspace: false, ...(decision.refused !== undefined && { refused: decision.refused }) });
      events.startCommand?.(command, false);
      return decision.refusal;
    }
    const workspace = decision.runsOn === 'workspace';
    record(command, { workspace });
    events.startCommand?.(command, workspace);
    return dropLateRejection(workspace ? host.runWorkspace(command) : host.runCaller(command), signal);
  };
}

export function driveToolLoop(
  session: AcpLoopSession, prompt: string, snapshot: AcpRunSnapshot,
  host: AcpToolHost, events: AcpLoopHandlers, signal: AbortSignal,
): void {
  const tools: AcpTool[] = snapshot.kind === 'core' && !snapshot.withoutTools ? createAcpToolTable(snapshot.grants) : [];
  const ledger = metadataLedger();
  const runCommand = gatedRunner(snapshot, tools, host, events, ledger.add, signal);
  runAcpToolLoop(session, prompt, {
    signal,
    primer: snapshot.kind === 'core' ? corePrimer(snapshot, tools) : MARKDOWN_INSTRUCTION,
    runCommand,
    extractCommand: snapshot.kind === 'core'
      ? toolExtractor(tools)
      : (text) => extractCommandBlock(text, snapshot.askUser),
    maxSteps: maxToolSteps(),
    describeCommand: describeLoopCommand,
  }, {
    startTurn: (isFirst) => { events.startTurn(isFirst); },
    chunk: (cumulative) => { events.chunk(cumulative); },
    endTurn: (final) => { events.endTurn(final); },
    ranCommand: (command, result, workspace, refused) => {
      const meta = ledger.take(command);
      events.ranCommand(command, result, meta?.workspace ?? workspace ?? false, meta?.refused ?? refused);
    },
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
