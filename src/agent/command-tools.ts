import { commands } from '../commands/index.js';
import type { CommandInvocationContext } from '../commands/types.js';
import type { Managers } from '../managers.js';
import type { AgentSnapshot } from './types.js';
import { isFileMutationCommandLine } from '../file-write/command.js';
import { isFileGlobCommandLine } from '../file-glob/command.js';
import { isFileGrepCommandLine } from '../file-grep/command.js';
import { isWebCommandLine } from '../web/command-line.js';
import { isSubagentCommandLine } from '../subagent/primer.js';

export function agentPrimer(snapshot: AgentSnapshot): string {
  const skills = snapshot.skills.map(({ name, instructions }) => `## ${name}\n${instructions}`).join('\n\n');
  return [
    'Complete the task below in the current project. Use native workspace tools for files and shell.',
    'Use only the selected skill instructions. To invoke a Janissary application command, put it inside a final fenced block whose info string is exactly `janissary`. Write the command in the block without a `janissary` prefix; arguments can span several lines, and prose may follow the block. A command on a bare line outside the block is just your answer, not a command.',
    'Only commands granted by the selected skills are permitted. A question requires the ask-user skill and the question grant.',
    `Task (${snapshot.taskPath}):\n${snapshot.taskText}`,
    ...(skills ? [`Selected skills:\n${skills}`] : []),
  ].join('\n\n');
}

export async function runGrantedAgentCommand(
  command: string,
  snapshot: AgentSnapshot,
  managers: Managers,
  invocation: CommandInvocationContext,
): Promise<string> {
  const input = command.trim().replace(/^\//, '');
  if (isSubagentCommandLine(input) || isFileMutationCommandLine(input) || isFileGlobCommandLine(input)
    || isFileGrepCommandLine(input) || isWebCommandLine(input)) {
    return `Agent: command not permitted: ${command}.`;
  }
  const entry = commands.find((candidate) => candidate.match(input));
  if (!entry || !snapshot.grants.includes(entry.name)) {
    return `Agent: command not permitted: ${command}.`;
  }
  if (entry.name === 'question' && snapshot.skills.every(({ name }) => name !== 'ask-user')) {
    return `Agent: command not permitted: ${command}.`;
  }
  const result = await managers.command.dispatchLineInInvocation(invocation.caller.label, input, { ...invocation, awaitResult: true });
  if (result.coreResponse) return result.output;
  if (result.result === undefined) return result.output;
  return typeof result.result === 'string' ? result.result : JSON.stringify(result.result) ?? String(result.result);
}
