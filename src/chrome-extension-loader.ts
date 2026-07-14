import type { Readable, Writable } from 'node:stream';

const RESPONSE_TIMEOUT_MS = 20000;

// Sends a single Chrome DevTools Protocol command over Chrome's `--remote-debugging-pipe`
// file descriptors (fd 3 write, fd 4 read) and waits for the matching response. Messages on
// the pipe are newline-free JSON terminated by a NUL byte, per Chromium's pipe transport.
function sendCdpCommand(
  writePipe: Writable,
  readPipe: Readable,
  method: string,
  params: unknown,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const id = 1;
    let buffer = '';

    const cleanup = (): void => {
      clearTimeout(timeout);
      readPipe.off('data', onData);
    };

    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`CDP command ${method} timed out after ${RESPONSE_TIMEOUT_MS}ms`));
    }, RESPONSE_TIMEOUT_MS);

    function onData(chunk: Buffer): void {
      buffer += chunk.toString('utf8');
      let sep = buffer.indexOf('\0');
      while (sep !== -1) {
        const raw = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 1);
        sep = buffer.indexOf('\0');

        let message: { id?: number; error?: { message: string }; result?: unknown };
        try {
          message = JSON.parse(raw) as typeof message;
        } catch {
          continue;
        }
        if (message.id === id) {
          cleanup();
          if (message.error) {
            reject(new Error(message.error.message));
          } else {
            resolve(message.result);
          }
          return;
        }
      }
    }

    readPipe.on('data', onData);
    writePipe.write(`${JSON.stringify({ id, method, params })}\0`);
  });
}

// Loads the bundled Frame Enabler extension into an already-launched, branded Chrome over the
// CDP `--remote-debugging-pipe` file descriptors (`Extensions.loadUnpacked`) — the sanctioned
// replacement for the `--load-extension` launch flag Google removed from branded Chrome 137+.
// `Extensions.loadUnpacked` is only reachable over the pipe transport, not `--remote-debugging-port`
// / a WebSocket connection, so `writePipe`/`readPipe` must be Chrome's inherited fd 3/4 streams.
// Never throws: any failure is reported as a single stderr warning, since page-tab framing is a
// nice-to-have, not core functionality.
export async function loadFrameEnablerExtension(
  writePipe: Writable,
  readPipe: Readable,
  extDir: string,
): Promise<void> {
  try {
    await sendCdpCommand(writePipe, readPipe, 'Extensions.loadUnpacked', { path: extDir });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    process.stderr.write(
      `warning: Chrome frame-enabler extension failed to load (${reason}) — sites that block iframing may not render in page tabs\n`,
    );
  }
}
