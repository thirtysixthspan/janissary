import type { AcpLoopHandlers, AcpToolHost } from '../acp/types.js';
import type { AcpPromptControl, ProviderTurn } from '../acp/prompt-control.js';
import { CORE_MAX_STEPS } from '../acp/drive-loop.js';
import { errorText } from '../error-text.js';
import type { ClientFrame, RemoteFrame } from './protocol-frames.js';

type TurnFrame = Extract<RemoteFrame, { type: 'acp-turn' }>;
type ToolRequestFrame = Extract<RemoteFrame, { type: 'acp-tool-request' }>;
type ToolStepFrame = Extract<RemoteFrame, { type: 'acp-tool-step' }>;
type RunEndReason = Extract<RemoteFrame, { type: 'acp-run-end' }>['reason'];

type RunState = {
  turn: ProviderTurn;
  events: AcpLoopHandlers;
  runCaller: AcpToolHost['runCaller'];
  text: string;
};

export type RemoteAcpRun = {
  start: (runCaller: AcpToolHost['runCaller'], events: AcpLoopHandlers) => boolean;
  chunk: (delta: string) => void;
  turn: (frame: TurnFrame) => void;
  request: (frame: ToolRequestFrame) => void;
  step: (frame: ToolStepFrame) => void;
  end: (reason: RunEndReason) => void;
};

export function createRemoteAcpRun(control: AcpPromptControl, send: (frame: ClientFrame) => void): RemoteAcpRun {
  let current: RunState | undefined;

  const active = (turn: ProviderTurn) => control.owns(turn) && !turn.cancelled;

  const accumulate = (state: RunState, delta: string) => {
    if (!control.owns(state.turn)) return;
    state.text += delta;
    state.events.chunk(state.text);
  };

  const chunk = (delta: string) => {
    if (current) accumulate(current, delta);
  };

  const finish = (events: AcpLoopHandlers, reason: string) => {
    if (reason === 'answered' || reason === 'capped') events.finished(reason, CORE_MAX_STEPS);
  };

  return {
    start(runCaller, events) {
      const turn = control.admit({
        onChunk: (delta) => { chunk(delta); },
        onEnd: (reason) => { finish(events, reason); },
        onError: (message) => { events.error(message); },
      });
      if (!turn) return false;
      current = { turn, events, runCaller, text: '' };
      return true;
    },
    chunk,
    turn(frame) {
      if (!current || !control.owns(current.turn)) return;
      if (frame.phase === 'start') {
        current.text = '';
        current.events.startTurn(frame.first);
      } else {
        current.events.endTurn(frame.display);
      }
    },
    request(frame) {
      const state = current;
      if (!state || !active(state.turn)) return;
      const { turn, events, runCaller } = state;
      events.startCommand?.(frame.command, false);
      void (async () => {
        try {
          const output = await runCaller(frame.command);
          if (!active(turn)) return;
          events.ranCommand(frame.command, output, false);
          send({ type: 'acp-tool-result', id: frame.id, request: frame.request, output });
        } catch (error) {
          if (active(turn)) {
            const message = errorText(error) || 'Command failed.';
            send({ type: 'acp-tool-result', id: frame.id, request: frame.request, error: message });
          }
        }
      })();
    },
    step(frame) {
      const state = current;
      if (!state || !active(state.turn)) return;
      state.events.startCommand?.(frame.command, frame.workspace);
      state.events.ranCommand(frame.command, frame.result, frame.workspace, frame.refused);
    },
    end(reason) {
      if (current && control.owns(current.turn)) control.end(current.turn, reason);
    },
  };
}
