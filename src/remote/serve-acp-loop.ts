import { driveToolLoop } from '../acp/drive-loop.js';
import type { AcpLoopHandlers, AcpLoopSession, AcpToolHost } from '../acp/types.js';
import { deferred, type Deferred } from '../deferred.js';
import { readWorkspaceCommand } from '../file-read/read.js';
import type { ClientFrame, ServerFrame } from './protocol-frames.js';

type AcpRunFrame = Extract<ClientFrame, { type: 'acp-run' }>;
type AcpToolResultFrame = Extract<ClientFrame, { type: 'acp-tool-result' }>;

export type RemoteLoopHandle = {
  toolResult: (frame: AcpToolResultFrame) => void;
};

export function startRemoteLoop(
  session: AcpLoopSession,
  frame: AcpRunFrame,
  workspaceDir: string,
  send: (frame: ServerFrame) => void,
): RemoteLoopHandle {
  const controller = new AbortController();
  const id = frame.id;
  let requestNumber = 0;
  let forwarded = false;
  const pending = new Map<number, Deferred<string>>();

  const host: AcpToolHost = {
    runWorkspace: (command) => readWorkspaceCommand(workspaceDir, command.trim().replace(/^\//, '')),
    runCaller: (command) => {
      const request = ++requestNumber;
      const result = deferred<string>();
      pending.set(request, result);
      forwarded = true;
      send({ type: 'acp-tool-request', id, request, command });
      return result.promise;
    },
  };

  const events: AcpLoopHandlers = {
    startTurn: (first) => { send({ type: 'acp-turn', id, phase: 'start', first }); },
    chunk: () => {},
    endTurn: (display) => { send({ type: 'acp-turn', id, phase: 'end', display }); },
    ranCommand: (command, result, workspace, refused) => {
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
    finished: (reason) => { send({ type: 'acp-run-end', id, reason }); },
    error: (message) => { send({ type: 'acp-error', id, message, fatal: false }); },
  };

  const forwarding: AcpLoopSession = {
    prompt: (text, handlers) => {
      session.prompt(text, {
        onChunk: (delta) => {
          handlers.onChunk(delta);
          send({ type: 'acp-chunk', id, text: delta });
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
  };
}
