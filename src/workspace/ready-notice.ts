import { abbreviateWorkspaceDir } from '../paths.js';

// How long provisioning took, for the ready notice: tenths of a second under a minute (`0.8s`,
// `12.3s`), then minutes and zero-padded seconds (`1m 05s`).
export function formatPrepareDuration(milliseconds: number): string {
  const tenths = Math.round(milliseconds / 100);
  if (tenths < 600) return `${(tenths / 10).toFixed(1)}s`;
  const seconds = Math.round(milliseconds / 1000);
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`;
}

export function workspaceReadyMessage(dir: string, milliseconds: number): string {
  return `Prepared workspace ${abbreviateWorkspaceDir(dir)} in ${formatPrepareDuration(milliseconds)}.`;
}
