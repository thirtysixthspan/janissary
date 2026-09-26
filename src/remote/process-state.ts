import type { ClientFrame, RemoteProcessState } from './protocol.js';

type SpawnFrame = Extract<ClientFrame, { type: 'spawn' }>;

// A spawn frame described the way `RemoteProcessState` describes a live process. Both ends build
// their process list from this — the session record the far side writes down, and the answer an
// attaching local side gets back — so what is stored and what is replayed are the same description
// of the same thing. A field the frame left out stays out rather than being written as undefined.
export function spawnFrameState(frame: SpawnFrame): RemoteProcessState {
  return {
    id: frame.id,
    program: frame.program,
    mode: frame.mode,
    ...(frame.harness !== undefined && { harness: frame.harness }),
    ...(frame.autoApprove !== undefined && { autoApprove: frame.autoApprove }),
    ...(frame.agentName !== undefined && { agentName: frame.agentName }),
  };
}
