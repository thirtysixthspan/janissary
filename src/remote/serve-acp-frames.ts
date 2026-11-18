import type { ProvisionedWorkspace } from './serve-provision.js';
import type { RemoteFrame, ServerFrame } from './protocol-frames.js';
import { resolveRemoteAgentRequest } from './serve-agent-resolution.js';

// The ACP and agent-resolution half of RemoteServer's frame switch, split out the way
// `serve-detach-query.ts` was. It consumes the six frames a client may send to a provisioned
// workspace and leaves every server-only or otherwise unhandled frame to the caller's switch.

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

export function dispatchAcpFrame(
  frame: RemoteFrame,
  workspace: ProvisionedWorkspace | undefined,
  emit: (frame: ServerFrame) => void,
): boolean {
  switch (frame.type) {
  case 'agent-resolve': { return gated(workspace, emit, (owner) => { resolveRemoteAgentRequest(frame, owner.dir, emit); }); }
  case 'acp-open': { return gated(workspace, emit, (owner) => { owner.acp.open(frame); }); }
  case 'acp-run': { return gated(workspace, emit, (owner) => { owner.acp.run(frame); }); }
  case 'acp-tool-result': { return optional(workspace, (owner) => { owner.acp.toolResult(frame); }); }
  case 'acp-close': { return optional(workspace, (owner) => { void owner.acp.close(frame.id); }); }
  case 'acp-cancel': { return optional(workspace, (owner) => { owner.acp.cancel(frame.id); }); }
  default: { return false; }
  }
}
