import type { AcpLoopHandlers, AcpToolHost } from '../acp/types.js';
import type { AcpPromptControl, ProviderTurn } from '../acp/prompt-control.js';
import { CORE_MAX_STEPS } from '../acp/drive-loop.js';
import type { RemoteFrame } from './protocol-frames.js';

type TurnFrame = Extract<RemoteFrame, { type: 'acp-turn' }>;
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
  end: (reason: RunEndReason) => void;
};

export function createRemoteAcpRun(control: AcpPromptControl): RemoteAcpRun {
  let current: RunState | undefined;

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
    end(reason) {
      if (current && control.owns(current.turn)) control.end(current.turn, reason);
    },
  };
}
