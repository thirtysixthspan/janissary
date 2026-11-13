import type { Managers } from '../managers.js';
import { RemoteFileSystemPort } from '../file-navigator/remote/port.js';

export const REMOTE_UNAVAILABLE = 'Remote connection unavailable.';

let sessionNumber = 0;

export async function withRemoteTabPort(
  managers: Managers,
  label: string,
  prefix: string,
  run: (port: RemoteFileSystemPort, workspace: string) => Promise<string>,
): Promise<string> {
  const channel = managers.remote?.get(label);
  const ready = managers.remote?.readyOf(label);
  const workspace = managers.remote?.workspaceOf(label);
  if (!channel || !ready || !workspace) return REMOTE_UNAVAILABLE;
  sessionNumber += 1;
  const port = new RemoteFileSystemPort(channel, `${prefix}-${String(sessionNumber)}`, ready);
  try {
    return await run(port, workspace);
  } finally {
    port.dispose();
  }
}
