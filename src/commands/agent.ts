import type { Command, CommandManagers } from './types.js';
import { commands } from './index.js';
import { parseAgentCommand } from '../agent/command-parser.js';
import { launchAgent } from '../agent/launch.js';
import { appendCommandOutput } from '../command/append.js';
import { invocationFor } from '../agent/command-invocation.js';
import type { AgentResult } from '../agent/execute.js';
import { formatAgentResult } from '../agent/format-result.js';

async function runAgent(
  commandText: string,
  label: string,
  managers: CommandManagers,
  invocation: ReturnType<typeof invocationFor>,
): Promise<AgentResult> {
  const launch = parseAgentCommand(commandText);
  if ('error' in launch) return { status: 'failed', response: launch.error, cleanupWarnings: [] };
  return await launchAgent(launch, commandText, label, managers, invocation, commands.map(({ name }) => name));
}

export const command: Command = {
  name: 'agent',
  match: (command_) => /^agent\b/i.test(command_),
  structuredResult: true,
  samples: ['agent execute task.md', 'agent with skill ask-user execute task.md'],
  run: async (commandText, tab, managers, invocation) => {
    const caller = invocationFor(tab.label, managers, invocation);
    const result = await runAgent(commandText, tab.label, managers, caller);
    const current = managers.tab.byLabel(tab.label);
    if (current?.runtime?.incarnation === caller.caller.incarnation) {
      appendCommandOutput(managers, tab.label, { input: commandText, output: formatAgentResult(result) }, caller);
    }
    return result;
  },
};
