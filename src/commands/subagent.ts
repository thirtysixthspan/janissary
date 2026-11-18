import type { Command } from './types.js';
import { acpAvailable } from '../acp/availability.js';
import { isSubagentCommandLine } from '../subagent/primer.js';
import { runSubagentCommand } from '../subagent/command-policy.js';

export const command: Command = {
  name: 'subagent',
  available: acpAvailable,
  coreResponse: true,
  match: isSubagentCommandLine,
  samples: ['subagent', 'subagent --role research --task t.md'],
  run: runSubagentCommand,
};
