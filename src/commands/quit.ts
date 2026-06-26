import type { Command } from './types.js';
import { cleanupResources } from '../cleanup-handlers.js';

export const command: Command = {
  name: 'quit',
  match: (command_) => {
    const lower = command_.toLowerCase();
    return lower === 'quit' || lower === 'exit';
  },
  handler: (_command, context) => {
    const { shellsRef, acpRef, browserRef, workspaceRef, exit } = context;
    cleanupResources({ workspaceRef, shellsRef, acpRef, browserRef });
    exit();
  },
};
