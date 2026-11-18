import { describe, expect, it, vi } from 'vitest';
import type { Managers } from '../managers.js';
import type { TabPluginActivation, TabPluginDeclaration } from './api.js';
import type { PluginFailureOrigin } from './failure.js';

const { createPluginContext } = vi.hoisted(() => ({ createPluginContext: vi.fn() }));

vi.mock('./context.js', () => ({ createPluginContext }));

import { invokePlugin } from './invoke.js';

const managers = {} as Managers;
const declaration = { id: 'fixture' } as TabPluginDeclaration;
const activation = {} as TabPluginActivation;
const origin: PluginFailureOrigin = { label: 'janus', command: 'fixture' };

type CapturedOptions = {
  answeringLabel?: string;
  adoptPtyId?: string;
  deferred?: {
    invoke: (call: () => unknown, answeringLabel: string) => Promise<unknown>;
    disable: (error: unknown) => void;
  };
};

function optionsAt(index: number): CapturedOptions {
  return createPluginContext.mock.calls[index]?.[5] as CapturedOptions;
}

describe('invokePlugin call forwarding', () => {
  it('carries adoptPtyId and disable into a deferred call', async () => {
    createPluginContext.mockClear();
    const disable = vi.fn();

    await invokePlugin(managers, declaration, activation, origin, () => true, 1000, () => 'first', {
      disable,
      adoptPtyId: 'pty7',
    });

    expect(createPluginContext).toHaveBeenCalledTimes(1);
    expect(optionsAt(0).adoptPtyId).toBe('pty7');
    expect(optionsAt(0).deferred).toBeDefined();

    await optionsAt(0).deferred?.invoke(() => 'later', 'answer-tab');

    expect(createPluginContext).toHaveBeenCalledTimes(2);
    expect(optionsAt(1).answeringLabel).toBe('answer-tab');
    expect(optionsAt(1).adoptPtyId).toBe('pty7');
    expect(optionsAt(1).deferred).toBeDefined();

    const failure = new Error('late failure');
    optionsAt(1).deferred?.disable(failure);
    expect(disable).toHaveBeenCalledOnce();
    expect(disable).toHaveBeenCalledWith(failure, origin);
  });

  it('builds no deferred call without a disable callback', async () => {
    createPluginContext.mockClear();

    await invokePlugin(managers, declaration, activation, origin, () => true, 1000, () => 'first', {
      adoptPtyId: 'pty7',
    });

    expect(optionsAt(0).deferred).toBeUndefined();
  });
});
