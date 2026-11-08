import { isBrowserCommandLine, BROWSER_PRIMER } from '../browser/command.js';
import { isQuestionCommandLine, QUESTION_PRIMER } from '../question-command.js';
import { findLastCommandLine } from './command-line.js';
import type { Managers } from '../managers.js';
import { NATIVE_ACP_COMMANDS } from '../plugins/roles/shared.js';
import { nativeCommandName, nativeCommandTool, type NativeCommandTool } from './native-commands.js';
import { resolveApplicationCommand } from '../application-commands.js';
import { refuseDisabledCommand } from '../native-commands/dispatch-policy.js';
import { notify } from '../notifications/index.js';
import { createInvocationContext } from '../command/invocation.js';

// One tool on the ACP run path. The three loop options the agent sees — what it is told the tools
// are, what runs a command it emitted, and what pulls a command out of its reply — are all derived
// from this one shape, so a new tool is one entry rather than three lists that can disagree.
//
// An entry carries two predicates because they read different text: `match` tests the command
// string the agent emitted, `isCommandLine` tests one cleaned line of the agent's reply.
export type AcpTool = {
  // The tool's slice of the agent primer.
  primer: string;
  // Whether this tool owns an emitted command.
  match: (command: string) => boolean;
  // Run an emitted command in a tab and return its textual output.
  run: (label: string, command: string) => string | Promise<string>;
  // Whether one cleaned reply line is a command in this tool's grammar.
  isCommandLine: (line: string) => boolean;
};

// Resolution strategy for running: **first match over an ordered array**, the same rule
// `src/commands/index.ts` uses. The runner stops at the first entry whose `match` claims the command,
// so order is the tie-break and the database entry stays last — its `match` accepts anything, making
// it the fall-through for a command no other tool recognized. Extraction does not use table order:
// the reply's last line that any tool recognizes is the command, whichever tool owns it.
export function createAcpToolTable(
  managers: Managers, _role: string, grants: readonly string[], signal?: AbortSignal,
): AcpTool[] {
  const run = (label: string, command: string) => dispatchNative(managers, label, command, signal);
  const ownedTools: Array<{ owner: NativeCommandTool; tool: AcpTool }> = [
    {
      owner: 'browser',
      tool: {
        primer: BROWSER_PRIMER,
        match: (command) => /^browser\b/i.test(command),
        run,
        isCommandLine: (line) => isBrowserCommandLine(line),
      },
    },
    {
      owner: 'question',
      tool: {
        primer: QUESTION_PRIMER,
        match: (command) => /^question\b/i.test(command),
        run,
        isCommandLine: (line) => isQuestionCommandLine(line),
      },
    },
    {
      owner: 'database',
      tool: {
        primer: managers.database.primer,
        match: () => true,
        run,
        isCommandLine: (line) => managers.database.isCommandLine(line),
      },
    },
  ];
  const allowed = NATIVE_ACP_COMMANDS.filter((command) => grants.includes(command));
  return ownedTools
    .filter(({ owner }) => allowed.some((command) => nativeCommandTool(command) === owner))
    .map(({ tool }) => tool);
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

// The joined primer and canonical allow-list, in table and vocabulary order.
export function toolPrimer(tools: AcpTool[], allowList: readonly string[]): string {
  if (tools.length === 0) return '';
  const allowed = NATIVE_ACP_COMMANDS.filter((command) => allowList.includes(command));
  return [
    ...tools.map((tool) => tool.primer),
    ...(allowed.length > 0 ? [`Only these commands are allowed: ${allowed.join(', ')}.`] : []),
  ].join('\n\n');
}

// Refuse ungranted commands before the database catch-all can claim them.
export function toolRunner(
  managers: Managers,
  tools: AcpTool[],
  role: string,
  grants: readonly string[],
  label: string,
): (command: string) => string | Promise<string> {
  const allowed = new Set(grants);
  return (command) => {
    const native = nativeCommandName(command);
    if (native === undefined) throw new Error(`No ACP tool matched command: ${command}`);
    const tool = tools.find((candidate) => candidate.match(command));
    if (!tool) throw new Error(`No ACP tool matched command: ${command}`);
    const row = resolveApplicationCommand(native);
    const setting = row === undefined
      ? undefined
      : managers.nativeCommandSettings?.current().commands.find((entry) => entry.name === row.name);
    if (setting?.effectiveEnabled === false) {
      const refusal = refuseDisabledCommand(managers, command, native, label);
      if (refusal !== undefined) return refusal;
    }
    if (row !== undefined && setting?.effectiveAgentAccess === false) {
      const message = `Command is disabled: ${row.name}.`;
      notify(managers, 'command-disabled', label, message);
      return message;
    }
    if (!allowed.has(native)) return `Command not allowed for role "${role}": ${native}.`;
    return tool.run(label, command);
  };
}

// The command on the reply's last line that any tool recognizes, or null when no line is one.
export function toolExtractor(tools: AcpTool[]): (text: string) => string | null {
  return (text) => findLastCommandLine(text, (line) => nativeCommandName(line) !== undefined
    && tools.some((tool) => tool.isCommandLine(line)));
}
