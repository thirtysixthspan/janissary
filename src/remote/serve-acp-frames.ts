import { errorText } from '../error-text.js';
import type { ProvisionedWorkspace } from './serve-provision.js';
import type { RemoteFrame, ServerFrame } from './protocol-frames.js';
import type { RemoteRunCloneResult } from './serve-run-clones.js';
import { resolveRemoteAgentRequest } from './serve-agent-resolution.js';

// The ACP, agent-resolution and run-clone half of RemoteServer's frame switch, split out the way
// `serve-detach-query.ts` was. It consumes the frames a client may send to a provisioned workspace
// and leaves every server-only or otherwise unhandled frame to the caller's switch.

function noWorkspace(emit: (frame: ServerFrame) => void): void {
  emit({ type: 'workspace-failed', message: 'No remote workspace has been provisioned.' });
}

function gated(
  workspace: ProvisionedWorkspace | undefined,
  emit: (frame: ServerFrame) => void,
  run: (owner: ProvisionedWorkspace) => void,
): boolean {
  if (workspace) run(workspace);
  else noWorkspace(emit);
  return true;
}

function optional(workspace: ProvisionedWorkspace | undefined, run: (owner: ProvisionedWorkspace) => void): boolean {
  if (workspace) run(workspace);
  return true;
}

type RunCloneRequest = Extract<RemoteFrame, { type: 'run-clone' }>;

async function answerRunClone(
  frame: RunCloneRequest,
  workspace: ProvisionedWorkspace | undefined,
  emit: (frame: ServerFrame) => void,
): Promise<void> {
  if (workspace) {
    const fallback = `Remote run clone ${frame.action} failed.`;
    const answer = (result: RemoteRunCloneResult): void => {
      if (typeof result.error === 'string') {
        emit({ type: 'run-clone-result', id: frame.id, error: result.error || fallback });
        return;
      }
      if (typeof result.dir === 'string') {
        emit({ type: 'run-clone-result', id: frame.id, dir: result.dir });
        return;
      }
      emit({ type: 'run-clone-result', id: frame.id });
    };
    const failed = (error: unknown): void => { answer({ error: errorText(error) || fallback }); };
    let pending: Promise<RemoteRunCloneResult>;
    try {
      pending = frame.action === 'create'
        ? workspace.runClones.create(frame.label)
        : workspace.runClones.release(frame.label);
    } catch (error) {
      failed(error);
      return;
    }
    let result: RemoteRunCloneResult;
    try {
      result = await pending;
    } catch (error) {
      failed(error);
      return;
    }
    answer(result);
    return;
  }
  emit({ type: 'run-clone-result', id: frame.id, error: 'No remote workspace has been provisioned.' });
}

export function dispatchAcpFrame(
  frame: RemoteFrame,
  workspace: ProvisionedWorkspace | undefined,
  emit: (frame: ServerFrame) => void,
): boolean {
  switch (frame.type) {
  case 'agent-resolve': { return gated(workspace, emit, (owner) => { resolveRemoteAgentRequest(frame, owner.dir, emit, (label) => owner.runClones.lookup(label)); }); }
  case 'acp-open': { return gated(workspace, emit, (owner) => { owner.acp.open(frame); }); }
  case 'acp-run': { return gated(workspace, emit, (owner) => { owner.acp.run(frame); }); }
  case 'acp-tool-result': { return optional(workspace, (owner) => { owner.acp.toolResult(frame); }); }
  case 'acp-close': { return optional(workspace, (owner) => { void owner.acp.close(frame.id); }); }
  case 'acp-cancel': { return optional(workspace, (owner) => { owner.acp.cancel(frame.id); }); }
  case 'run-clone': { void answerRunClone(frame, workspace, emit); return true; }
  default: { return false; }
  }
}
