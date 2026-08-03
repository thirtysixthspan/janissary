import { describe, expect, it, vi } from 'vitest';
import type { JanusClient } from '../ws';
import { createPluginClientCapabilities } from './api';

function makeClient(request?: () => Promise<unknown>) {
  const send = vi.fn();
  const value = {
    send,
    request: vi.fn(request ?? (async () => ({ ok: true }))),
  } as unknown as JanusClient;
  return { client: value, send };
}

describe('createPluginClientCapabilities', () => {
  it('builds an authenticated resource URL from the session token', () => {
    history.replaceState(null, '', '/?token=s3cr3t%2Ftoken');
    const { client } = makeClient();
    const capabilities = createPluginClientCapabilities('video', client);
    expect(capabilities.resourceUrl('/open/abc')).toBe('/open/abc?token=s3cr3t%2Ftoken');
  });

  it('sends an empty token when the page has none, rather than omitting the parameter', () => {
    history.replaceState(null, '', '/');
    const { client } = makeClient();
    expect(createPluginClientCapabilities('video', client).resourceUrl('/open/abc'))
      .toBe('/open/abc?token=');
  });

  it('binds every intent to its own tab label and returns the result', async () => {
    const { client } = makeClient(async () => ({ name: 'clip.shot-1.png' }));
    const capabilities = createPluginClientCapabilities('video-2', client);

    await expect(capabilities.intent('capture-frame', { dataUrl: 'data:image/png;base64,AA==' }))
      .resolves.toEqual({ name: 'clip.shot-1.png' });
    expect(client.request).toHaveBeenCalledWith({
      method: 'pluginIntent',
      params: {
        tab: 'video-2', intent: 'capture-frame', payload: { dataUrl: 'data:image/png;base64,AA==' },
      },
    });
  });

  it('rejects when the server answers an intent with no result', async () => {
    const { client } = makeClient(async () => { /* server replied with no result */ });
    await expect(createPluginClientCapabilities('video', client).intent('capture-frame', {}))
      .rejects.toThrow('Plugin intent "capture-frame" failed');
  });

  it('reports a failure against its own tab label', () => {
    const { client, send } = makeClient();
    createPluginClientCapabilities('video', client).reportFailure('chunk rejected');
    expect(send).toHaveBeenCalledWith({
      method: 'pluginFailed', params: { tab: 'video', reason: 'chunk rejected' },
    });
  });

  it('offers no split action when the host did not supply one', () => {
    const { client } = makeClient();
    expect(createPluginClientCapabilities('video', client).splitAction).toBeNull();
    expect(createPluginClientCapabilities('video', client, () => {}).splitAction).not.toBeNull();
  });
});
