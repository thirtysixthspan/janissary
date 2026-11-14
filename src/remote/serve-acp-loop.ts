import { driveToolLoop } from '../acp/drive-loop.js';
import type { AcpLoopHandlers, AcpLoopSession, AcpSession, AcpToolHost } from '../acp/types.js';
import { deferred, type Deferred } from '../deferred.js';
import { LocalFileSystemPort } from '../file-navigator/filesystem-port.js';
import { globWorkspaceCommand } from '../file-glob/glob.js';
import { isFileGlobCommandLine } from '../file-glob/command.js';
import { readWorkspaceCommand } from '../file-read/read.js';
import { isFileMutationCommandLine } from '../file-write/command.js';
import { runFileMutation } from '../file-write/tab-write.js';
import type { ClientFrame, ServerFrame } from './protocol-frames.js';

type AcpRunFrame = Extract<ClientFrame, { type: 'acp-run' }>;
type AcpToolResultFrame = Extract<ClientFrame, { type: 'acp-tool-result' }>;

export type RemoteLoopHandle = {
  toolResult: (frame: AcpToolResultFrame) => void;
  cancel: () => Promise<void>;
  abort: () => void;
};

export function startRemoteLoop(
  session: AcpSession,
  frame: AcpRunFrame,
  workspaceDir: string,
  send: (frame: ServerFrame) => void,
): RemoteLoopHandle {
  const controller = new AbortController();
  const aborted = () => controller.signal.aborted;
  const id = frame.id;
  let requestNumber = 0;
  let forwarded = false;
  let cancellation: Promise<void> | undefined;
  const pending = new Map<number, Deferred<string>>();

  const abort = () => {
    if (aborted()) return;
    controller.abort();
    for (const request of pending.values()) request.reject(new Error('ACP: run aborted.'));
    pending.clear();
  };

  const host: AcpToolHost = {
    runWorkspace: (command) => {
      const normalized = command.trim().replace(/^\//, '');
      if (isFileMutationCommandLine(normalized)) {
        return runFileMutation(new LocalFileSystemPort(), workspaceDir, normalized);
      }
      if (isFileGlobCommandLine(normalized)) return globWorkspaceCommand(workspaceDir, normalized);
      return readWorkspaceCommand(workspaceDir, normalized);
    },
    runCaller: (command) => {
      if (aborted()) return '';
      const request = ++requestNumber;
      const result = deferred<string>();
      pending.set(request, result);
      forwarded = true;
      send({ type: 'acp-tool-request', id, request, command });
      return result.promise;
    },
  };

  const events: AcpLoopHandlers = {
    startTurn: (first) => { if (!aborted()) send({ type: 'acp-turn', id, phase: 'start', first }); },
    chunk: () => {},
    endTurn: (display) => { if (!aborted()) send({ type: 'acp-turn', id, phase: 'end', display }); },
    ranCommand: (command, result, workspace, refused) => {
      if (aborted()) return;
      if (forwarded) {
        forwarded = false;
        return;
      }
      send({
        type: 'acp-tool-step', id, command, result,
        workspace: workspace ?? false,
        ...(refused !== undefined && { refused }),
      });
    },
    finished: (reason) => { if (!aborted()) send({ type: 'acp-run-end', id, reason }); },
    error: (message) => { if (!aborted()) send({ type: 'acp-error', id, message, fatal: false }); },
  };

  const forwarding: AcpLoopSession = {
    prompt: (text, handlers) => {
      session.prompt(text, {
        onChunk: (delta) => {
          handlers.onChunk(delta);
          if (!aborted()) send({ type: 'acp-chunk', id, text: delta });
        },
        onEnd: (stopReason) => { handlers.onEnd(stopReason); },
        onError: (message) => { handlers.onError(message); },
      });
    },
  };

  driveToolLoop(forwarding, frame.text, frame.snapshot, host, events, controller.signal);

  return {
    toolResult: (result) => {
      const request = pending.get(result.request);
      if (request === undefined) return;
      pending.delete(result.request);
      if (result.output === undefined) request.reject(new Error(result.error));
      else request.resolve(result.output);
    },
    cancel: () => {
      if (aborted()) return cancellation ?? Promise.resolve();
      cancellation = (async () => {
        abort();
        await session.cancel();
        send({ type: 'acp-run-end', id, reason: 'cancelled' });
      })();
      return cancellation;
    },
    abort,
  };
}
