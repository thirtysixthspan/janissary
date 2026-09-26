import type { RemoteFrame } from '../protocol-frames.js';
import { malformed, type DecodeResult } from './decode-shared.js';
import { decodeFilesystemFrame } from './decode-filesystem.js';
import { decodeSessionStateResult } from './decode-sessions.js';
import { decodeShellHistory } from './decode-history.js';
import {
  decodeCloneAnswer, decodeCloneOffer, decodeRootRefused,
} from './decode-root.js';
import {
  decodeCaptureRequest, decodeCaptureReply, decodeGateEvent, decodeBusyTransition,
} from './decode-detect.js';
import {
  decodeAcpOpen, decodeAcpText, decodeAcpAddressed, decodeAcpEnd, decodeAcpError,
} from './decode-acp.js';
import { decodeProvision } from './decode-provision.js';
import {
  decodeAddressedData, decodeAttach, decodeBrowserExited, decodeExit, decodeKill, decodeNameInUse,
  decodeResize, decodeSpawn, decodeTranscript, decodeWorkspaceFailed, decodeWorkspaceReady,
} from './decode-lifecycle.js';

// The `default` branch of the switch below. The `never` parameter is the point: the call only
// typechecks while every frame type in the union has a case, so a type added to `RemoteFrame` but
// not to this dispatcher fails the build rather than being refused at runtime as if it were a frame
// from a mismatched remote. The throw is the runtime backstop.
function unhandledRemoteFrame(type: never): never {
  throw new Error(`Unhandled remote frame type: ${String(type)}`);
}

// `type` is already known to be one of the declared frame types — `decodeFrame` checks membership
// before calling — so the switch is exhaustive over the union rather than open over `string`.
export function decodeKnownFrame(type: RemoteFrame['type'], record: Record<string, unknown>): DecodeResult {
  switch (type) {
  case 'attach': { return decodeAttach(record); }
  case 'attach-result': {
    if (typeof record.accepted !== 'boolean') return malformed(type);
    if (record.truncated !== undefined && typeof record.truncated !== 'boolean') return malformed(type);
    return {
      type, accepted: record.accepted,
      ...(record.truncated !== undefined && { truncated: record.truncated }),
    };
  }
  case 'session-state': { return { type }; }
  case 'session-state-result': { return decodeSessionStateResult(record); }
  case 'shutdown': { return { type }; }
  case 'provision': { return decodeProvision(record); }
  case 'clone-answer': { return decodeCloneAnswer(record); }
  case 'clone-offer': { return decodeCloneOffer(record); }
  case 'root-refused': { return decodeRootRefused(record); }
  case 'spawn': { return decodeSpawn(record); }
  case 'input': { return decodeAddressedData(type, record); }
  case 'resize': { return decodeResize(record); }
  case 'kill': { return decodeKill(record); }
  case 'capture-request': { return decodeCaptureRequest(record); }
  case 'capture-reply': { return decodeCaptureReply(record); }
  case 'gate-event': { return decodeGateEvent(record); }
  case 'busy-transition': { return decodeBusyTransition(record); }
  case 'workspace-ready': { return decodeWorkspaceReady(record); }
  case 'workspace-failed': { return decodeWorkspaceFailed(record); }
  case 'name-in-use': { return decodeNameInUse(record); }
  case 'output': { return decodeAddressedData(type, record); }
  case 'exit': { return decodeExit(record); }
  case 'browser-exited': { return decodeBrowserExited(record); }
  case 'transcript': { return decodeTranscript(record); }
  case 'shell-history': { return decodeShellHistory(record); }
  case 'filesystem-open':
  case 'filesystem-close':
  case 'filesystem-request':
  case 'filesystem-reply':
  case 'filesystem-event': { return decodeFilesystemFrame(type, record); }
  case 'acp-open': { return decodeAcpOpen(record); }
  case 'acp-prompt':
  case 'acp-chunk': { return decodeAcpText(type, record); }
  case 'acp-close':
  case 'acp-ready': { return decodeAcpAddressed(type, record); }
  case 'acp-end': { return decodeAcpEnd(record); }
  case 'acp-error': { return decodeAcpError(record); }
  default: { return unhandledRemoteFrame(type); }
  }
}
