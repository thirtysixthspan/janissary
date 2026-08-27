import type { CdpPipe } from './cdp-pipe.js';

// Loads the bundled Frame Enabler extension into an already-launched, branded Chrome over the
// CDP `--remote-debugging-pipe` file descriptors (`Extensions.loadUnpacked`) — the sanctioned
// replacement for the `--load-extension` launch flag Google removed from branded Chrome 137+.
// `Extensions.loadUnpacked` is only reachable over the pipe transport, not `--remote-debugging-port`
// / a WebSocket connection.
// Never throws: any failure is reported as a single stderr warning, since page-tab framing is a
// nice-to-have, not core functionality.
export async function loadFrameEnablerExtension(
  cdp: CdpPipe,
  extDir: string,
): Promise<void> {
  try {
    await cdp.send('Extensions.loadUnpacked', { path: extDir });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    process.stderr.write(
      `warning: Chrome frame-enabler extension failed to load (${reason}) — sites that block iframing may not render in page tabs\n`,
    );
  }
}
