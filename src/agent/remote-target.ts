import { randomUUID } from 'node:crypto';
import type { Managers } from '../managers.js';
import { parseRemoteAddress, type RemoteAddress } from '../remote/address.js';
import type { RemoteChannel } from '../remote/channel/index.js';
import { isUsableEntry } from '../remote/attach.js';
import { resolveRemoteLaunchAddress } from '../remote/saved-host.js';
import { awaitReady } from './readiness.js';
import { AGENT_CLONE_DEPTH } from '../workspace/clone-depth.js';

export type RemoteAgentTarget = Readonly<{
  channel: RemoteChannel;
  host: string;
  workspace: string;
  release: () => Promise<void>;
}>;

function sameEndpoint(left: RemoteAddress, right: RemoteAddress): boolean {
  return left.destination.toLowerCase() === right.destination.toLowerCase() && left.port === right.port;
}

function establishedLabel(managers: Managers, address: RemoteAddress): string | undefined {
  const entry = managers.remote.liveEntries().find((candidate) =>
    sameEndpoint(candidate.address, address) && isUsableEntry(candidate),
  );
  return entry?.labels.values().next().value;
}

export async function resolveRemoteAgentTarget(
  managers: Managers,
  selector: string,
  sourceLabel: string,
  callerCwd: string,
  signal: AbortSignal,
): Promise<RemoteAgentTarget> {
  const parsed = parseRemoteAddress(selector);
  if ('error' in parsed) throw new Error(parsed.error);
  const resolved = resolveRemoteLaunchAddress(managers, sourceLabel, parsed);
  const sourceAddress = managers.remote.addressOf(sourceLabel);
  const sourceChannel = managers.remote.get(sourceLabel);
  const sourceWorkspace = managers.remote.workspaceOf(sourceLabel);
  const existingLabel = resolved.path === undefined
    ? sourceAddress !== undefined && sameEndpoint(sourceAddress, resolved) && sourceChannel?.attached && sourceWorkspace
      ? sourceLabel
      : establishedLabel(managers, resolved)
    : undefined;
  if (existingLabel) {
    const channel = managers.remote.get(existingLabel);
    const workspace = managers.remote.workspaceOf(existingLabel);
    if (channel?.attached && workspace) {
      return {
        channel,
        host: managers.remote.addressOf(existingLabel)?.host ?? resolved.host,
        workspace,
        release: managers.remote.acquireAgentLease(existingLabel, `agent:${randomUUID()}`),
      };
    }
  }

  const label = `agent-${randomUUID()}`;
  const channel = managers.remote.create(label, resolved, callerCwd, {
    onReady: () => {},
    onFailed: () => {},
    onClosed: () => {},
  }, undefined, { nonInteractive: true, depth: AGENT_CLONE_DEPTH });
  try {
    const ready = managers.remote.readyOf(label);
    if (!ready) throw new Error('Agent: remote workspace is not ready.');
    const workspace = await awaitReady(ready, signal, 15_000, 'Agent: remote workspace readiness timed out.');
    if (!channel.attached) throw new Error('Agent: remote connection unavailable.');
    const release = managers.remote.acquireAgentLease(label, `agent:${randomUUID()}`);
    managers.remote.release(label);
    return { channel, host: resolved.host, workspace, release };
  } catch (error) {
    managers.remote.release(label);
    throw error;
  }
}

export async function inheritRemoteAgentTarget(
  managers: Managers,
  label: string,
): Promise<RemoteAgentTarget> {
  const channel = managers.remote.get(label);
  const workspace = managers.remote.workspaceOf(label);
  const address = managers.remote.addressOf(label);
  if (!channel?.attached || !workspace || !address) throw new Error('Agent: remote workspace is not ready.');
  return {
    channel,
    host: address.host,
    workspace,
    release: managers.remote.acquireAgentLease(label, `agent:${randomUUID()}`),
  };
}
