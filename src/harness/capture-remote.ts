import { RemoteChannel } from '../remote/channel.js';
import { provisionOrigin, remoteCaptureCommand } from '../remote/entry-factory.js';
import { parseRemoteAddress } from '../remote/address.js';
import type { PtySession } from '../pty.js';
import type { Managers } from '../managers.js';
import type { RemoteSessionRecord } from '../sessions/store.js';

export type RemoteCaptureResult = { text: string; capturedAt: number } | { error: string } | undefined;

export const DETACHED_CAPTURE_TIMEOUT_MS = 15_000;

/**
 * `harness capture <name>` against a session with no open tab (decision 16 of the
 * auto-accept-while-detached plan): a Detach closes every tab, so there is no `RemoteChannel` to ask
 * over. This spins up a throwaway `ssh -t <host> janus remote-serve` connection, asks it for one
 * process's capture — which it answers from its own live workspace when it happens to still hold
 * one, or by relaying the query into the parked peer on the same host otherwise, see
 * `RemoteServer.dispatch()`'s `capture-request` case — and tears the connection down the moment it
 * answers. Never sends `attach`, so the parked peer's socket and expiry timer are never touched.
 */
export function queryParkedCapture(
  managers: Managers, record: RemoteSessionRecord, processId: string,
): Promise<RemoteCaptureResult> {
  return new Promise((resolve) => {
    const remote = parseRemoteAddress(record.address);
    if ('error' in remote) { resolve(undefined); return; }
    const deferred: { session?: PtySession } = {};
    let terminal = '';
    const timeout = setTimeout(() => finish({ error: 'Detached capture query timed out.' }), DETACHED_CAPTURE_TIMEOUT_MS);
    timeout.unref();
    let settled = false;
    const finish = (value: RemoteCaptureResult, terminate = true): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if ('text' in (value ?? {})) {
        channel.finish();
        channel.closeAfterShutdown();
      } else if (terminate) deferred.session?.kill();
      resolve(value);
    };
    const channel: RemoteChannel = new RemoteChannel({
      get id() { return deferred.session?.id ?? ''; },
      write: (data) => deferred.session?.write(data),
      kill: () => deferred.session?.kill(),
    }, {
      onTerminalData: (data) => { terminal += data; },
      onAttached: () => {
        void channel.requestCapture(processId, record.session, provisionOrigin(managers).origin).then(finish);
      },
      onFrame: () => {},
      onError: (message) => finish({ error: message }, false),
      onClose: () => finish(terminal ? { error: terminal.trim() } : undefined, false),
    });
    deferred.session = managers.pty.spawnTransport(
      `capture:${record.workspaceLabel}`, 'ssh', remoteCaptureCommand(remote), process.cwd(),
      { onData: (data) => channel.receive(data), onExit: () => channel.closed() },
    );
  });
}
