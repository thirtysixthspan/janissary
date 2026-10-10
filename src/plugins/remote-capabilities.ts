import type { Managers } from '../managers.js';
import { RemoteFileSystemPort } from '../file-navigator/remote/port.js';
import { materializeRemoteFile } from '../file-navigator/remote/file-cache.js';
import type { TabPluginServerCapabilities } from './api.js';

// The remote workspace a plugin tab rides, reached as a filesystem port. Built the first time a tab
// asks and kept after that, which is the same lifetime a remote navigator's port has: the channel
// closes every navigator session on it when its last tab lets it go. It exists so that a plugin never
// constructs one, and it publishes only the two capabilities a remote workspace needs — its change
// set, and a file materialized for the ordinary openers.

const ports = new Map<string, RemoteFileSystemPort>();

function portFor(managers: Managers, label: string): RemoteFileSystemPort | undefined {
  const existing = ports.get(label);
  if (existing) return existing;
  const channel = managers.remote?.get(label);
  const ready = managers.remote?.readyOf(label);
  if (!channel || !ready) return undefined;
  const created = new RemoteFileSystemPort(channel, label, ready);
  ports.set(label, created);
  return created;
}

export function remoteCapabilities(input: {
  managers: Managers;
  originLabel: string;
  answeringLabel?: string;
  isEnabled: () => boolean;
}): Pick<TabPluginServerCapabilities, 'readWorkspaceChangeSet' | 'materializeRemoteFile'> {
  const { managers, originLabel, answeringLabel, isEnabled } = input;
  // The tab the call came from, which is the tab riding the channel: an intent on a diff tab names
  // that tab, and a command names the tab it was typed in.
  const label = answeringLabel ?? originLabel;
  const ride = () => {
    if (!isEnabled()) return;
    const port = portFor(managers, label);
    const root = managers.remote?.workspaceOf(label);
    const host = managers.remote?.addressOf(label)?.host;
    return port && root && host ? { port, root, host } : undefined;
  };
  return {
    // A tab riding no channel is answered with nothing rather than an error: the question is about a
    // directory that is not on another machine, and the caller decides what that means.
    readWorkspaceChangeSet: (fullFiles) => {
      const channel = ride();
      return channel ? channel.port.changeSet(channel.root, fullFiles) : null;
    },
    materializeRemoteFile: async (relPath) => {
      const channel = ride();
      if (!channel) return null;
      // The local path a remote file has been materialized to, through the same cache a remote
      // navigator's row opens through. The record it leaves names this port, so a save from an editor
      // opened out of a diff tab writes back to the workspace for as long as that tab holds the
      // channel — the same record a navigator's own rows leave.
      try {
        const content = await channel.port.readFile(channel.root, relPath);
        return materializeRemoteFile(
          channel.host, managers.remote?.workspaceLabelOf(label) ?? label, relPath, content,
          { filesystem: channel.port, root: channel.root, relPath, label },
        );
      } catch {
        return null;
      }
    },
  };
}
