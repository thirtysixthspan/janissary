import { describe, expect, it } from 'vitest';
import { isClientMessage } from './client-message.js';

describe('isClientMessage', () => {
  it('accepts a recognized RPC envelope with object params', () => {
    expect(isClientMessage({
      t: 'rpc',
      id: 1,
      method: 'command',
      params: { text: 'help' },
    })).toBe(true);
  });

  it.each([
    null,
    [],
    'rpc',
    { t: 'event', id: 1, method: 'command', params: {} },
    { t: 'rpc', id: '1', method: 'command', params: {} },
    { t: 'rpc', id: 1, method: 'unknown', params: {} },
    { t: 'rpc', id: 1, method: 'command' },
    { t: 'rpc', id: 1, method: 'command', params: null },
    { t: 'rpc', id: 1, method: 'command', params: [] },
    { t: 'rpc', id: 1, method: 'command', params: 'help' },
  ])('rejects an invalid envelope %#', (value) => {
    expect(isClientMessage(value)).toBe(false);
  });

  // Params are validated by the handler that understands them, so a malformed plugin intent is a
  // well-formed envelope here and becomes an RPC error rather than a dropped message.
  it('accepts a plugin-intent envelope without judging its params', () => {
    for (const params of [
      { tab: 'video', schemaVersion: 1, intent: 'capture-frame', payload: { dataUrl: 'png' } },
      { tab: '', schemaVersion: 0, intent: '', payload: { nested: undefined } },
    ]) {
      expect(isClientMessage({ t: 'rpc', id: 2, method: 'pluginIntent', params })).toBe(true);
    }
    expect(isClientMessage({ t: 'rpc', id: 2, method: 'pluginIntent', params: 'nope' })).toBe(false);
  });
});
