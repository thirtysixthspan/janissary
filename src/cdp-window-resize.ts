import type { Readable, Writable } from 'node:stream';

const RESPONSE_TIMEOUT_MS = 20_000;

// Sends a single Chrome DevTools Protocol command over Chrome's `--remote-debugging-pipe` file
// descriptors (fd 3 write, fd 4 read) and waits for the matching response. Mirrors
// chrome-extension-loader.ts's pipe-command plumbing (messages are newline-free JSON terminated
// by a NUL byte, per Chromium's pipe transport).
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

// Resizes the app's own Chrome window over the CDP pipe transport already opened in `openApp`:
// looks up the window id for the app's page target, then sets its bounds. Only reachable over the
// pipe transport, same as `Extensions.loadUnpacked` in chrome-extension-loader.ts.
//
// `Browser.getWindowForTarget` can't be called with no params here: the pipe connection is a
// browser-level session with no target attached to it (unlike a `--remote-debugging-port` page
// session), so Chrome has nothing to resolve implicitly and replies "No web contents in the
// target." We look up the page target's id via `Target.getTargets` and pass it explicitly.
export async function resizeAppWindow(
  writePipe: Writable,
  readPipe: Readable,
  width: number,
  height: number,
): Promise<void> {
  const { targetInfos } = await sendCdpCommand(writePipe, readPipe, 'Target.getTargets', {}) as {
    targetInfos: { targetId: string; type: string }[];
  };
  const pageTarget = targetInfos.find((t) => t.type === 'page');
  if (!pageTarget) throw new Error('resizeAppWindow: no page target found');

  const { windowId } = await sendCdpCommand(
    writePipe,
    readPipe,
    'Browser.getWindowForTarget',
    { targetId: pageTarget.targetId },
  ) as { windowId: number };
  await sendCdpCommand(writePipe, readPipe, 'Browser.setWindowBounds', { windowId, bounds: { width, height } });
}

// Reads the app's own Chrome window size over the same CDP pipe transport as `resizeAppWindow`
// (its get-bounds companion), for `profile save` to capture into `_layout.json`.
export async function getAppWindowBounds(
  writePipe: Writable,
  readPipe: Readable,
): Promise<{ width: number; height: number }> {
  const { targetInfos } = await sendCdpCommand(writePipe, readPipe, 'Target.getTargets', {}) as {
    targetInfos: { targetId: string; type: string }[];
  };
  const pageTarget = targetInfos.find((t) => t.type === 'page');
  if (!pageTarget) throw new Error('getAppWindowBounds: no page target found');

  const { windowId } = await sendCdpCommand(
    writePipe,
    readPipe,
    'Browser.getWindowForTarget',
    { targetId: pageTarget.targetId },
  ) as { windowId: number };
  const { bounds } = await sendCdpCommand(writePipe, readPipe, 'Browser.getWindowBounds', { windowId }) as {
    bounds: { width: number; height: number };
  };
  return { width: bounds.width, height: bounds.height };
}
