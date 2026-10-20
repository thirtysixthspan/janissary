import path from 'node:path';
import type { Managers } from '../managers.js';
import type { Tab } from '../tab/types.js';
import { isRemoteCacheFile, remoteFileFor } from '../file-navigator/remote/file-cache.js';
import type { OriginWorkspaceAnswer } from './origin-workspace.js';
import {
  channelWorkspace, cloneWorkspace, goneWorkspace, localCloneOf, ridingTabFor,
} from './origin-workspace-records.js';

// The origin-workspace rules for tabs that carry no remote target of their own: agent monitors,
// editors, and file navigators. Each answers gone once its workspace no longer exists.

const NONE: OriginWorkspaceAnswer = { provisioning: false };

function gone(dir: string, label: string): OriginWorkspaceAnswer {
  return { workspace: goneWorkspace(dir, label), provisioning: false };
}

function localPathWorkspace(managers: Managers, file: string): OriginWorkspaceAnswer {
  const clone = localCloneOf(file);
  return clone === undefined ? NONE : cloneWorkspace(managers, clone);
}

// A monitor points at its run's workspace, which the agent manager keeps while it is bound.
export function agentMonitorWorkspace(managers: Managers, tab: Tab): OriginWorkspaceAnswer {
  const runId = tab.plugin?.agentRunId;
  const run = runId === undefined ? undefined : managers.agent?.runs?.get(runId);
  if (!run) return gone('', tab.label);
  const { host, workspace } = run.view();
  if (host === 'Local') return localPathWorkspace(managers, workspace);
  const ride = ridingTabFor(managers, host, workspace);
  const channel = ride === undefined ? undefined : channelWorkspace(managers, ride, host);
  if (channel) return { workspace: channel, provisioning: false };
  return { workspace: { ...goneWorkspace(workspace, path.basename(workspace)), host }, provisioning: false };
}

// An editor's file is a local path, or a cached copy riding the tab that materialized it.
export function editorWorkspace(managers: Managers, tab: Tab): OriginWorkspaceAnswer {
  const file = tab.editor?.path ?? '';
  if (!isRemoteCacheFile(file)) return localPathWorkspace(managers, file);
  const record = remoteFileFor(file);
  if (!record) return gone('', tab.label);
  if (managers.remote?.get?.(record.label) !== undefined) {
    const host = managers.remote.addressOf?.(record.label)?.host;
    const channel = channelWorkspace(managers, record.label, host);
    if (channel) return { workspace: channel, provisioning: false };
  }
  return gone('', managers.remote?.workspaceLabelOf?.(record.label) ?? path.basename(record.root));
}

// A remote navigator rides its own channel; a local one is rooted at `absoluteRoot`.
export function navigatorWorkspace(managers: Managers, tab: Tab): OriginWorkspaceAnswer {
  const files = tab.files;
  if (!files) return NONE;
  if (!files.remote) return localPathWorkspace(managers, files.absoluteRoot);
  if (managers.remote?.get?.(tab.label) === undefined) return gone('', tab.label);
  const channel = channelWorkspace(managers, tab.label, files.remote.host);
  if (channel) return { workspace: channel, provisioning: false };
  const workspaceLabel = managers.remote.workspaceLabelOf?.(tab.label);
  return { provisioning: true, ...(workspaceLabel !== undefined && { workspaceLabel }) };
}
