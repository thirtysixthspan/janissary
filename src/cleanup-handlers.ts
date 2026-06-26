import { removeWorkspace } from './workspace.js';
import { closeAllConnections } from './connections.js';

export interface CleanupContext {
  workspaceRef: { current: Set<string> };
  shellsRef: { current: Map<number, { kill(): void }> };
  acpRef: { current: Map<number, { kill(): void }> };
  browserRef: { current: Map<number, { browser: { close(): void | Promise<void> } }> };
}

export function cleanupResources(context: CleanupContext): void {
  for (const directory of context.workspaceRef.current) removeWorkspace(directory);
  context.workspaceRef.current.clear();
  for (const [, shell] of context.shellsRef.current) shell.kill();
  context.shellsRef.current.clear();
  for (const [, session] of context.acpRef.current) session.kill();
  context.acpRef.current.clear();
  for (const [, entry] of context.browserRef.current) void entry.browser.close();
  context.browserRef.current.clear();
  closeAllConnections();
}
