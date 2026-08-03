import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { JanusClient } from '../ws';
import { createPluginClientCapabilities } from './api';
import { clearClientPluginFailures } from './registry';

function makeClient(request?: () => Promise<unknown>) {
  const send = vi.fn();
  const value = {
    send,
    request: vi.fn(request ?? (async () => ({ ok: true }))),
  } as unknown as JanusClient;
  return { client: value, send };
}

beforeEach(() => { clearClientPluginFailures(); });
afterEach(() => { clearClientPluginFailures(); });

describe('createPluginClientCapabilities', () => {
  it('builds an authenticated resource URL from the session token', () => {
    history.replaceState(null, '', '/?token=s3cr3t%2Ftoken');
    const { client } = makeClient();
    const capabilities = createPluginClientCapabilities('video', 'video', client, true, null);
    expect(capabilities.resourceUrl('/open/abc')).toBe('/open/abc?token=s3cr3t%2Ftoken');
  });

  it('sends an empty token when the page has none, rather than omitting the parameter', () => {
    history.replaceState(null, '', '/');
    const { client } = makeClient();
    expect(createPluginClientCapabilities('video', 'video', client, true, null).resourceUrl('/open/abc'))
      .toBe('/open/abc?token=');
  });

  it('binds every intent to its own tab label and returns the result', async () => {
    const { client } = makeClient(async () => ({ name: 'clip.shot-1.png' }));
    const capabilities = createPluginClientCapabilities('video', 'video-2', client, true, null);

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
    await expect(createPluginClientCapabilities('video', 'video', client, true, null).intent('capture-frame', {}))
      .rejects.toThrow('Plugin intent "capture-frame" failed');
  });

  it('reports a failure against its own tab label', () => {
    const { client, send } = makeClient();
    createPluginClientCapabilities('video', 'video', client, true, null).reportFailure('chunk rejected');
    expect(send).toHaveBeenCalledWith({
      method: 'pluginFailed', params: { tab: 'video', reason: 'chunk rejected' },
    });
  });

  // The plugin is disabled for the session on the first report and the server closes its tabs, so a
  // second report — from another of its tabs, or from a component still finishing its own work —
  // would race that teardown rather than tell the server anything it does not already know.
  it('sends only the first report for a plugin, across every tab it owns', () => {
    const { client, send } = makeClient();
    createPluginClientCapabilities('video', 'video', client, true, null).reportFailure('render exploded');
    createPluginClientCapabilities('video', 'video-2', client, true, null).reportFailure('render exploded too');
    expect(send).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith({
      method: 'pluginFailed', params: { tab: 'video', reason: 'render exploded' },
    });
  });

  it('keeps one plugin\'s failure from silencing another\'s', () => {
    const { client, send } = makeClient();
    createPluginClientCapabilities('video', 'video', client, true, null).reportFailure('render exploded');
    createPluginClientCapabilities('other', 'other', client, true, null).reportFailure('chunk rejected');
    expect(send).toHaveBeenCalledTimes(2);
  });

  // A plugin tab stays mounted while hidden, so the host — not the plugin's own DOM — is what says
  // whether the tab is the visible one.
  it('reports the host\'s answer for whether this tab is active', () => {
    const { client } = makeClient();
    expect(createPluginClientCapabilities('video', 'video', client, true, null).active).toBe(true);
    expect(createPluginClientCapabilities('video', 'video', client, false, null).active).toBe(false);
  });

  // Placement is host-owned too: a plugin laying itself out for a narrow sidebar reads it here
  // rather than measuring the frame the host renders around it.
  it('reports which sidebar the tab is docked into, and null in the centre', () => {
    const { client } = makeClient();
    expect(createPluginClientCapabilities('video', 'video', client, true, null).dock).toBeNull();
    expect(createPluginClientCapabilities('video', 'video', client, true, 'left').dock).toBe('left');
    expect(createPluginClientCapabilities('video', 'video', client, true, 'right').dock).toBe('right');
  });

  it('offers no split action when the host did not supply one', () => {
    const { client } = makeClient();
    expect(createPluginClientCapabilities('video', 'video', client, true, null).splitAction).toBeNull();
    expect(createPluginClientCapabilities('video', 'video', client, true, null, () => {}).splitAction)
      .not.toBeNull();
  });
});
