import type { Command } from './types.js';
import { closeAllConnections } from '../connections.js';
import { removeWorkspace } from '../workspace.js';

export const command: Command = {
  name: 'quit',
  match: (command_) => {
    const lower = command_.toLowerCase();
    return lower === 'quit' || lower === 'exit';
  },
  handler: (_command, context) => {
    const { shellsRef, acpRef, browserRef, workspaceRef, exit } = context;
    for (const dir of workspaceRef.current) removeWorkspace(dir);
    workspaceRef.current.clear();
    for (const [, shell] of shellsRef.current) shell.kill();
    shellsRef.current.clear();
    for (const [, session] of acpRef.current) session.kill();
    acpRef.current.clear();
    for (const [, e] of browserRef.current) void e.browser.close();
    browserRef.current.clear();
    closeAllConnections();
    exit();
  },
};
