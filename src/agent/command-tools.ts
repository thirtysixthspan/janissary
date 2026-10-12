import { commands } from '../commands/index.js';
import type { CommandInvocationContext } from '../commands/types.js';
import type { Managers } from '../managers.js';
import type { AgentSnapshot } from './types.js';

export function agentPrimer(snapshot: AgentSnapshot): string {
  const skills = snapshot.skills.map(({ name, instructions }) => `## ${name}\n${instructions}`).join('\n\n');
  return [
    'Complete the task below in the current project. Use native workspace tools for files and shell.',
    'Use only the selected skill instructions. To invoke a Janissary application command, end your reply with one final line: janissary <command>.',
    'Only commands granted by the selected skills are permitted. A question requires the ask-user skill and the question grant.',
    `Task (${snapshot.taskPath}):\n${snapshot.taskText}`,
    ...(skills ? [`Selected skills:\n${skills}`] : []),
  ].join('\n\n');
}

export function extractAgentCommand(text: string, allowQuestion: boolean): string | null {
  const lines = text.split('\n');
  let fenced = false;
  let finalLine = '';
  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    const normalized = line.trim().replaceAll(/^`+|`+$/g, '').trim();
    if (normalized) finalLine = normalized;
  }
  if (/^janissary\s+/i.test(finalLine)) return finalLine.replace(/^janissary\s+/i, '');
  if (allowQuestion && /^question\s+(ask|approve)\b/i.test(finalLine)) return finalLine;
  return null;
}

export async function runGrantedAgentCommand(
  command: string,
  snapshot: AgentSnapshot,
  managers: Managers,
  invocation: CommandInvocationContext,
): Promise<string> {
  const input = command.trim().replace(/^\//, '');
  const entry = commands.find((candidate) => candidate.match(input));
  if (!entry || !snapshot.grants.includes(entry.name)) {
    return `Agent: command not permitted: ${command}.`;
  }
  if (entry.name === 'question' && snapshot.skills.every(({ name }) => name !== 'ask-user')) {
    return `Agent: command not permitted: ${command}.`;
  }
  const result = await managers.command.dispatchLineInInvocation(invocation.caller.label, input, { ...invocation, awaitResult: true });
  if (result.result === undefined) return result.output;
  return typeof result.result === 'string' ? result.result : JSON.stringify(result.result) ?? String(result.result);
}
