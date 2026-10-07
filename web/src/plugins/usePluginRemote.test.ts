import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { RemoteTargetView } from '@shared/protocol';
import type { JanusClient } from '../ws';
import { usePluginRemote } from './usePluginRemote';

describe('usePluginRemote', () => {
  it('keeps remote capabilities stable when refreshed views have equal values', () => {
    const remote: RemoteTargetView = { address: 'ssh://build', host: 'build' };
    const client = {} as JanusClient;
    const { result, rerender } = renderHook(
      ({ target }) => usePluginRemote(target, client, 'shell-1'),
      { initialProps: { target: remote } },
    );
    const first = result.current;

    rerender({ target: { ...remote } });

    expect(result.current).toBe(first);
    expect(result.current.remote).toEqual(remote);
  });
});
