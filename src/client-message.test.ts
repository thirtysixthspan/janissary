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
});
