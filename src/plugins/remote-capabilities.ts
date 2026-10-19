import type { Managers } from '../managers.js';
import type { RemoteChannel } from '../remote/channel/index.js';
import { RemoteFileSystemPort } from '../file-navigator/remote/port.js';
import { forgetRemoteFilesOf, materializeRemoteFile } from '../file-navigator/remote/file-cache.js';
import type { TabPluginServerCapabilities } from './api.js';

// The remote workspace a plugin tab rides, reached as a filesystem port. Built the first time a tab
// asks and kept after that, which is the same lifetime a remote navigator's port has: the channel
// closes every navigator session on it when its last tab lets it go. It exists so that a plugin never
// constructs one, and it publishes only the two capabilities a remote workspace needs — its change
// set, and a file materialized for the ordinary openers.

type PluginRemoteResource = {
  channel: RemoteChannel;
  port: RemoteFileSystemPort;
  live: boolean;
};

const resources = new Map<string, PluginRemoteResource>();

function releaseResource(label: string, expected?: PluginRemoteResource): void {
  const resource = resources.get(label);
  if (!resource || (expected && resource !== expected)) return;
  resources.delete(label);
  resource.live = false;
  forgetRemoteFilesOf(resource.port);
  resource.port.dispose();
}

export function releasePluginRemoteResource(label: string): void {
  releaseResource(label);
}

export function releasePluginRemoteResources(): void {
  for (const label of resources.keys()) releaseResource(label);
}

function resourceFor(managers: Managers, label: string): PluginRemoteResource | undefined {
  const tab = managers.tab.byLabel(label);
  const channel = managers.remote?.get(label);
  if (!tab || !channel) return undefined;
  const existing = resources.get(label);
  if (existing?.channel === channel && existing.live) return existing;
  if (existing) releaseResource(label, existing);
  const ready = managers.remote?.readyOf(label);
  const root = managers.remote?.workspaceOf(label);
  if (!ready || !root) return undefined;
  const created = { channel, port: new RemoteFileSystemPort(channel, label, ready), live: true };
  resources.set(label, created);
  return created;
}

function resourceIsLive(managers: Managers, label: string, resource: PluginRemoteResource): boolean {
  return resource.live && resources.get(label) === resource
    && managers.tab.byLabel(label) !== undefined
    && managers.remote?.get(label) === resource.channel;
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
    const resource = resourceFor(managers, label);
    const entry = managers.remote?.entryOf(label);
    const root = entry?.workspaceDir;
    return resource && entry && root
      ? {
          resource, port: resource.port, root,
          owner: { destination: entry.address.destination, workspaceRoot: root, workspaceLabel: entry.workspaceLabel },
        }
      : undefined;
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
        if (!resourceIsLive(managers, label, channel.resource)) return null;
        return materializeRemoteFile(channel.owner, relPath, content,
          { filesystem: channel.port, root: channel.root, relPath, label },
        );
      } catch {
        return null;
      }
    },
  };
}
