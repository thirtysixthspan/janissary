import { createConnection, type Socket } from 'node:net';
import { decodeFrame, encodeFrame } from './protocol.js';

// The longest first answer a terminate waits for. A peer's answer to `attach` is one short
// `attach-result`, so a line that runs past this is not one, and the connection is dropped.
const ANSWER_BUDGET_BYTES = 1024;

function isAccepted(line: string): boolean {
  const frame = decodeFrame(line);
  return 'type' in frame && frame.type === 'attach-result' && frame.accepted;
}

/**
 * End a parked session from a sessions-tab terminate. Nothing the local side sends is relayed: this
 * process writes the only two frames the peer ever sees from it, so it is safe whichever protocol
 * version the peer was started under. Both use the oldest encoding of their frame — an `attach`
 * carrying only `session`, and a bare `shutdown` — which every peer that writes a record decodes.
 *
 * Only the peer's first line, its `attach-result`, is forwarded; the history it replays after
 * accepting is dropped, since nothing is going to render it. `shutdown` follows only an accepted
 * answer, and the writable side is then ended so no later write can reach the peer at all.
 */
export function terminatePeer(
  socketPath: string, session: string, output: (data: string) => void, ended: (terminated: boolean) => void,
): Socket {
  const socket = createConnection(socketPath);
  let buffer = '';
  let answered = false;
  socket.setEncoding('utf8');
  socket.once('connect', () => socket.write(`${encodeFrame({ type: 'attach', session })}\n`));
  socket.on('data', (data: string) => {
    if (answered) return;
    buffer += data;
    const newline = buffer.indexOf('\n');
    if (newline === -1) {
      if (buffer.length > ANSWER_BUDGET_BYTES) socket.destroy();
      return;
    }
    answered = true;
    const line = buffer.slice(0, newline);
    if (isAccepted(line)) socket.write(`${encodeFrame({ type: 'shutdown' })}\n`);
    socket.end();
    output(`${line}\n`);
  });
  socket.on('error', () => socket.destroy());
  socket.on('close', () => ended(false));
  return socket;
}
