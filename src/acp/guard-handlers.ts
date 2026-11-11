import type { AcpLoopHandlers } from './types.js';

// Late callbacks from a reset or closed session must not rewrite its successor's response.
export function guardAcpHandlers(handlers: AcpLoopHandlers, active: () => boolean): AcpLoopHandlers {
  return {
    startTurn: (first) => { if (active()) handlers.startTurn(first); },
    chunk: (text) => { if (active()) handlers.chunk(text); },
    endTurn: (text) => { if (active()) handlers.endTurn(text); },
    startCommand: (command, workspace) => { if (active()) handlers.startCommand?.(command, workspace); },
    ranCommand: (command, result, workspace, refused) => { if (active()) handlers.ranCommand(command, result, workspace, refused); },
    finished: (reason, steps) => { if (active()) handlers.finished(reason, steps); },
    error: (message) => { if (active()) handlers.error(message); },
  };
}
