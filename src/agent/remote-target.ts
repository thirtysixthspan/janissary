import { randomUUID } from 'node:crypto';
import type { Managers } from '../managers.js';
import { parseRemoteAddress } from '../remote/address.js';
import type { RemoteChannel } from '../remote/channel/index.js';
import { isUsableEntry } from '../remote/attach.js';
import { awaitReady } from './readiness.js';
import { AGENT_CLONE_DEPTH } from '../workspace/clone-depth.js';

export type RemoteAgentTarget = Readonly<{
  channel: RemoteChannel;
  host: string;
  workspace: string;
  release: () => Promise<void>;
}>;

function establishedLabel(managers: Managers, destination: string): string | undefined {
  const entry = managers.remote.liveEntries().find((candidate) =>
    candidate.address.destination.toLowerCase() === destination.toLowerCase() && isUsableEntry(candidate),
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
  const sourceAddress = managers.remote.addressOf(sourceLabel);
  const sourceChannel = managers.remote.get(sourceLabel);
  const sourceWorkspace = managers.remote.workspaceOf(sourceLabel);
  const existingLabel = parsed.path === undefined
    ? sourceAddress?.destination.toLowerCase() === parsed.destination.toLowerCase() && sourceChannel?.attached && sourceWorkspace
      ? sourceLabel
      : establishedLabel(managers, parsed.destination)
    : undefined;
  if (existingLabel) {
    const channel = managers.remote.get(existingLabel);
    const workspace = managers.remote.workspaceOf(existingLabel);
    if (channel?.attached && workspace) {
      return {
        channel,
        host: managers.remote.addressOf(existingLabel)?.host ?? parsed.host,
        workspace,
        release: managers.remote.acquireAgentLease(existingLabel, `agent:${randomUUID()}`),
      };
    }
  }

  const label = `agent-${randomUUID()}`;
  const channel = managers.remote.create(label, parsed, callerCwd, {
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
    return { channel, host: parsed.host, workspace, release };
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
