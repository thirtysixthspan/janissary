import { describe, expect, it, vi } from 'vitest';
import type { Managers } from '../managers.js';
import { createPluginControllerAdapter } from './plugin-adapter.js';

describe('createPluginControllerAdapter', () => {
  it('delegates the generic intent envelope to the plugin host', async () => {
    const request = { tab: 'video', schemaVersion: 1, intent: 'capture-frame', payload: { dataUrl: 'png' } };
    const reply = { schemaVersion: 1, payload: { name: 'clip.shot-1.png' } };
    const managers = {
      plugins: { pluginIntent: vi.fn(async () => reply) },
    } as unknown as Managers;

    await expect(createPluginControllerAdapter(managers).pluginIntent(request)).resolves.toEqual(reply);
    expect(managers.plugins.pluginIntent).toHaveBeenCalledWith(request);
  });
});
