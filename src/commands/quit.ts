import type { Command } from './types.js';
import { closeAllConnections } from '../connections.js';
import { removeWorkspace } from '../workspace.js';

export const command: Command = {
  name: 'quit',
  match: (cmd) => {
    const lower = cmd.toLowerCase();
    return lower === 'quit' || lower === 'exit';
  },
  handler: (_cmd, ctx) => {
    const { shellsRef, acpRef, browserRef, workspaceRef, exit } = ctx;
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
