import { isBrowserCommandLine, BROWSER_PRIMER } from '../browser/command.js';
import { isQuestionCommandLine, QUESTION_PRIMER } from '../question-command.js';
import { DB_PRIMER, isDatabaseCommandLine } from '../database/primer.js';
import { findLastCommandLine } from './command-line.js';
import { NATIVE_ACP_COMMANDS } from '../plugins/roles/shared.js';
import { nativeCommandName, nativeCommandTool, type NativeCommandTool } from './native-commands.js';
import type { AcpRunSnapshot } from './types.js';
import { FILE_READ_PRIMER, isFileReadCommandLine } from '../file-read/command.js';
import { FILE_MUTATION_PRIMER, isFileMutationCommandLine } from '../file-write/command.js';

// One tool on the ACP run path. The three loop options the agent sees — what it is told the tools
// are, which side runs a command it emitted, and what pulls a command out of its reply — are all
// derived from this one shape, so a new tool is one entry rather than three lists that can disagree.
// The table is plain data: it loads no managers, so both hosts can import it.
//
// An entry carries two predicates because they read different text: `match` tests the command
// string the agent emitted, `isCommandLine` tests one cleaned line of the agent's reply.
export type AcpTool = {
  // The tool's slice of the agent primer.
  primer: string;
  // Whether this tool owns an emitted command.
  match: (command: string) => boolean;
  // Whether one cleaned reply line is a command in this tool's grammar.
  isCommandLine: (line: string) => boolean;
  // Which side runs an emitted command: the caller's machine or the workspace.
  runsOn: 'caller' | 'workspace';
};

// Resolution strategy for running: **first match over an ordered array**, the same rule
// `src/commands/index.ts` uses. The gate stops at the first entry whose `match` claims the command,
// so order is the tie-break and the database entry stays last — its `match` accepts anything, making
// it the fall-through for a command no other tool recognized. Extraction does not use table order:
// the reply's last line that any tool recognizes is the command, whichever tool owns it.
export function createAcpToolTable(grants: readonly string[]): AcpTool[] {
  const allowed = NATIVE_ACP_COMMANDS.filter((command) => grants.includes(command));
  const ownedTools: Array<{ owner: NativeCommandTool; tool: AcpTool }> = [
    {
      owner: 'browser',
      tool: {
        primer: BROWSER_PRIMER,
        match: (command) => /^browser\b/i.test(command),
        isCommandLine: (line) => isBrowserCommandLine(line),
        runsOn: 'caller',
      },
    },
    {
      owner: 'question',
      tool: {
        primer: QUESTION_PRIMER,
        match: (command) => /^question\b/i.test(command),
        isCommandLine: (line) => isQuestionCommandLine(line),
        runsOn: 'caller',
      },
    },
    {
      owner: 'file',
      tool: {
        primer: filePrimer(allowed),
        match: (command) => /^file\b/i.test(command),
        isCommandLine: (line) => isFileReadCommandLine(line) || isFileMutationCommandLine(line),
        runsOn: 'workspace',
      },
    },
    {
      owner: 'database',
      tool: {
        primer: DB_PRIMER,
        match: () => true,
        isCommandLine: (line) => isDatabaseCommandLine(line),
        runsOn: 'caller',
      },
    },
  ];
  return ownedTools
    .filter(({ owner }) => allowed.some((command) => nativeCommandTool(command) === owner))
    .map(({ tool }) => tool);
}

function filePrimer(allowed: readonly string[]): string {
  return [
    ...(allowed.includes('file read') ? [FILE_READ_PRIMER] : []),
    ...(allowed.includes('file write') || allowed.includes('file edit') ? [FILE_MUTATION_PRIMER] : []),
  ].join('\n\n');
}

// The joined primer and canonical allow-list, in table and vocabulary order.
export function toolPrimer(tools: AcpTool[], allowList: readonly string[]): string {
  if (tools.length === 0) return '';
  const allowed = NATIVE_ACP_COMMANDS.filter((command) => allowList.includes(command));
  return [
    ...tools.map((tool) => tool.primer),
    ...(allowed.length > 0 ? [`Only these commands are allowed: ${allowed.join(', ')}.`] : []),
  ].join('\n\n');
}

// What the gate decided for one command: the side that runs it, or the tool-result text refusing it.
export type AcpGateDecision =
  | { runsOn: AcpTool['runsOn'] }
  | { refusal: string; refused?: 'disabled' };

// Decide from the snapshot alone whether a command may run, and on which side.
export function gateCommand(
  snapshot: AcpRunSnapshot, tools: readonly AcpTool[], command: string,
): AcpGateDecision {
  if (snapshot.kind === 'agent') return gateAgentCommand(snapshot, command);
  return gateCoreCommand(snapshot, tools, command);
}

function gateCoreCommand(
  snapshot: Extract<AcpRunSnapshot, { kind: 'core' }>, tools: readonly AcpTool[], command: string,
): AcpGateDecision {
  const native = nativeCommandName(command);
  if (native === undefined) throw new Error(`No ACP tool matched command: ${command}`);
  const tool = tools.find((candidate) => candidate.match(command));
  if (!tool) throw new Error(`No ACP tool matched command: ${command}`);
  const row = snapshot.rows.find((candidate) => candidate.name === native);
  if (row !== undefined && (!row.effectiveEnabled || !row.effectiveAgentAccess)) {
    return { refusal: `Command is disabled: ${native}.`, refused: 'disabled' };
  }
  if (!snapshot.grants.includes(native)) {
    return { refusal: `Command not allowed for role "${snapshot.roleName}": ${native}.` };
  }
  return { runsOn: tool.runsOn };
}

function gateAgentCommand(
  snapshot: Extract<AcpRunSnapshot, { kind: 'agent' }>, command: string,
): AcpGateDecision {
  const input = command.trim().replace(/^\//, '');
  if (isFileMutationCommandLine(input)) return { refusal: `Agent: command not permitted: ${command}.` };
  if (!isFileReadCommandLine(input)) return { runsOn: 'caller' };
  if (!snapshot.grants.includes('file')) return { refusal: `Agent: command not permitted: ${command}.` };
  return { runsOn: 'workspace' };
}

// The command on the reply's last line that any tool recognizes, or null when no line is one.
export function toolExtractor(tools: AcpTool[]): (text: string) => string | null {
  return (text) => findLastCommandLine(text, (line) => nativeCommandName(line) !== undefined
    && tools.some((tool) => tool.isCommandLine(line)));
}
