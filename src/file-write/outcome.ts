import { fileOperationReason, OUTSIDE_ROOT_REASON } from '../file-navigator/file-operation-result.js';
import { CLOSED_REASON, ENDED_REASON, TIMED_OUT_REASON } from '../file-navigator/remote/port-requests.js';
import { REMOTE_UNAVAILABLE } from '../file-read/remote-tab-port.js';
import { displayPath, matchFailureLine } from './messages.js';

const OUTSIDE_WORKSPACE = 'Outside the workspace';

const PASS_THROUGH_MESSAGES: ReadonlySet<string> = new Set([
  REMOTE_UNAVAILABLE,
  ENDED_REASON,
  TIMED_OUT_REASON,
  CLOSED_REASON,
]);

function reasonLine(reason: string, path: string): string {
  return `${displayPath(reason)}: ${displayPath(path)}.`;
}

export function mutationFailureLine(reason: string, path: string): string {
  const match = matchFailureLine(reason, path);
  if (match !== undefined) return match;
  if (PASS_THROUGH_MESSAGES.has(reason)) return reason;
  if (reason === OUTSIDE_WORKSPACE || reason === OUTSIDE_ROOT_REASON) return reasonLine(OUTSIDE_WORKSPACE, path);
  return reasonLine(reason, path);
}

export function mutationRejectionLine(error: unknown, path: string): string {
  if (!(error instanceof Error)) return reasonLine(fileOperationReason(error), path);
  if (PASS_THROUGH_MESSAGES.has(error.message)) return error.message;
  if (error.message === OUTSIDE_ROOT_REASON) return reasonLine(OUTSIDE_WORKSPACE, path);
  return reasonLine(error.message, path);
}
