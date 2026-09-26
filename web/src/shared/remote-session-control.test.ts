import { describe, expect, it, vi } from 'vitest';
import { remoteSessionControl } from './remote-session-control';
import type { JanusClient } from '../ws';
import type { RemoteTargetView } from '@shared/protocol';

// One RPC carries both verbs, so the only thing a call site can get wrong is which tab is being
// addressed — and the control is built once per tab that renders the metadata row. The state it
// offers is the channel's, read off the view rather than re-derived anywhere per call site.

const REMOTE: RemoteTargetView = { host: 'devbox', address: 'devbox:/srv/project' };

function client(answer: 'no-request' | { ok: true; value: boolean } | { ok: false; error?: string }) {
  const send = vi.fn();
  const request = answer === 'no-request' ? undefined : vi.fn().mockResolvedValue(answer);
  return { client: { send, request } as unknown as JanusClient, send, request };
}

describe('remoteSessionControl state', () => {
  it('offers the control while the channel is up', () => {
    expect(remoteSessionControl(client({ ok: true, value: true }).client, 'work', REMOTE).state).toBe('active');
  });

  it('offers it again once a reconnecting channel is back, not before', () => {
    const reconnecting = { ...REMOTE, reconnecting: true };
    expect(remoteSessionControl(client({ ok: true, value: true }).client, 'work', reconnecting).state)
      .toBe('reconnecting');
  });

  it('shows a channel with no workspace as still provisioning, whatever else it says', () => {
    // A channel with no workspace cannot be mid-backoff — recovery needs a session id and a
    // workspace both — and a control that is merely not pressable is the safe answer.
    const both = { ...REMOTE, provisioning: true, reconnecting: true };
    expect(remoteSessionControl(client({ ok: true, value: true }).client, 'work', both).state).toBe('provisioning');
  });

  it('treats the flags as absent rather than false', () => {
    const neither = { ...REMOTE, provisioning: false, reconnecting: false };
    expect(remoteSessionControl(client({ ok: true, value: true }).client, 'work', neither).state).toBe('active');
  });
});

describe('remoteSessionControl onAction', () => {
  it.each(['detach', 'attach'] as const)('addresses the named tab with a %s request', async (action) => {
    const { client: socket, request } = client({ ok: true, value: true });

    await remoteSessionControl(socket, 'work', REMOTE).onAction(action);

    expect(request).toHaveBeenCalledWith({ method: 'remoteSession', params: { action, label: 'work' } });
  });

  it('answers whether the action actually ran', async () => {
    const ran = remoteSessionControl(client({ ok: true, value: true }).client, 'work', REMOTE);
    const refused = remoteSessionControl(client({ ok: true, value: false }).client, 'work', REMOTE);

    await expect(ran.onAction('detach')).resolves.toBe(true);
    await expect(refused.onAction('attach')).resolves.toBe(false);
  });

  it('answers false on a refused request, which the feed then explains', async () => {
    const control = remoteSessionControl(client({ ok: false, error: 'not remote' }).client, 'work', REMOTE);

    await expect(control.onAction('detach')).resolves.toBe(false);
  });

  // A client old enough to predate `request` still has to be drivable, and the control says the
  // action did not run rather than waiting forever for a reply that can never arrive.
  it('falls back to a plain send on a client with no request, and answers false', async () => {
    const { client: socket, send, request } = client('no-request');

    await expect(remoteSessionControl(socket, 'work', REMOTE).onAction('detach')).resolves.toBe(false);

    expect(send).toHaveBeenCalledWith({ method: 'remoteSession', params: { action: 'detach', label: 'work' } });
    expect(request).toBeUndefined();
  });
});
