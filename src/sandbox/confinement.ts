import { existsSync } from 'node:fs';
import { getConfig } from '../config.js';

let cachedAvailable: boolean | undefined;

export function sandboxAvailable(): boolean {
  cachedAvailable ??= process.platform === 'darwin' && existsSync('/usr/bin/sandbox-exec');
  return cachedAvailable;
}

export function sandboxWillConfine(workspaceDir: string | undefined): boolean {
  return shouldConfineWorkspace(Boolean(workspaceDir), getConfig().sandboxWorkspaces, sandboxAvailable());
}

export function shouldConfineWorkspace(hasWorkspace: boolean, enabled: boolean, available: boolean): boolean {
  return hasWorkspace && enabled && available;
}
