import { afterEach, describe, expect, it, vi } from 'vitest';
import { queryParkedCapture, DETACHED_CAPTURE_TIMEOUT_MS } from './capture-remote.js';
import { encodeFrame, encodeHandshake, HANDSHAKE_SENTINEL } from '../remote/protocol.js';
import { REMOTE_SHUTDOWN_DRAIN_MS } from '../remote/shutdown-drain.js';
import type { Managers } from '../managers.js';
import type { RemoteSessionRecord } from '../sessions/store.js';

type TransportHandlers = { onData: (data: string) => void; onExit: () => void };

function harness() {
  let handlers: TransportHandlers | undefined;
  const write = vi.fn();
  const kill = vi.fn();
  const managers = {
    pty: {
      spawnTransport: vi.fn((_label, _program, _command, _cwd, value: TransportHandlers) => {
        handlers = value;
        return { id: 'query', program: 'ssh', write, resize: vi.fn(), kill };
      }),
    },
  } as unknown as Managers;
  const record = {
    address: 'devbox', workspaceLabel: 'claude', session: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  } as RemoteSessionRecord;
  return { managers, record, write, kill, transport: () => handlers! };
}

afterEach(() => vi.useRealTimers());

describe('queryParkedCapture', () => {
  it('shuts down a successful throwaway relay after its capture reply', async () => {
    vi.useFakeTimers();
    const h = harness();
    const result = queryParkedCapture(h.managers, h.record, 'h1');
    h.transport().onData(`${encodeHandshake()}\n`);
    h.transport().onData(`${encodeFrame({ type: 'capture-reply', id: 'h1', request: '1', text: 'screen', capturedAt: 1 })}\n`);

    await expect(result).resolves.toEqual({ text: 'screen', capturedAt: 1 });
    expect(h.write).toHaveBeenLastCalledWith(`${encodeFrame({ type: 'shutdown' })}\n`);
    expect(h.kill).not.toHaveBeenCalled();
    vi.advanceTimersByTime(REMOTE_SHUTDOWN_DRAIN_MS);
    expect(h.kill).toHaveBeenCalledOnce();
  });

  it('returns a remote protocol failure to the caller', async () => {
    const h = harness();
    const result = queryParkedCapture(h.managers, h.record, 'h1');
    h.transport().onData(`${HANDSHAKE_SENTINEL} {"version":999,"root":"/srv"}\n`);

    await expect(result).resolves.toMatchObject({ error: expect.stringContaining('protocol') });
    expect(h.kill).toHaveBeenCalledOnce();
  });

  it('bounds a query that never reaches a relay', async () => {
    vi.useFakeTimers();
    const h = harness();
    const result = queryParkedCapture(h.managers, h.record, 'h1');
    vi.advanceTimersByTime(DETACHED_CAPTURE_TIMEOUT_MS);

    await expect(result).resolves.toEqual({ error: 'Detached capture query timed out.' });
    expect(h.kill).toHaveBeenCalledOnce();
  });
});
