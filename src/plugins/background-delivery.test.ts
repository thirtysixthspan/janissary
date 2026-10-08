import { describe, expect, it, vi } from 'vitest';
import { TabPluginRejection, type TabPluginActivation, type TabPluginServerCapabilities } from './api.js';
import type { PluginCallOutcome } from './invoke.js';
import type { PluginRecord } from './status.js';
import { BACKGROUND_ORIGIN, deliverBackground, type BackgroundDeliveryPort } from './background-delivery.js';

function recordWith(activation: TabPluginActivation | undefined): PluginRecord {
  return {
    state: 'active',
    declaration: {
      id: 'fixture', version: '1.0.0', apiVersion: 2, payloadSchemaVersion: 1,
      tabLabelPrefix: 'fixture', fileExtensions: {},
    },
    ...(activation && { activation }),
  };
}

function port() {
  const disable = vi.fn();
  const invoke = vi.fn(async (
    _record: PluginRecord,
    _activation: TabPluginActivation,
    origin: unknown,
    call: (capabilities: TabPluginServerCapabilities) => void | Promise<void>,
    timeoutMs: number,
  ) => {
    void call({} as TabPluginServerCapabilities);
    expect(origin).toBe(BACKGROUND_ORIGIN);
    expect(timeoutMs).toBe(1000);
    return { status: 'ok', value: undefined } as PluginCallOutcome<void>;
  });
  return { port: { records: () => [], timeoutMs: 1000, invoke, disable } as unknown as BackgroundDeliveryPort, invoke, disable };
}

describe('deliverBackground', () => {
  it('runs the handler with the event and the capabilities, under the background origin and budget', async () => {
    const { port: fixture, invoke } = port();
    const handler = vi.fn();
    const activation = { notify: handler } as unknown as TabPluginActivation;

    await deliverBackground(fixture, recordWith(activation), handler, { topic: 'schedules' });

    expect(handler).toHaveBeenCalledWith({ topic: 'schedules' }, expect.anything());
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke.mock.calls[0]?.[2]).toBe(BACKGROUND_ORIGIN);
    expect(invoke.mock.calls[0]?.[4]).toBe(1000);
  });

  it('leaves the plugin running when the guarded call is rejected', async () => {
    const fixture = {
      records: () => [],
      timeoutMs: 1000,
      invoke: () => Promise.resolve({ status: 'rejected', reason: 'no caller to answer' } as PluginCallOutcome<void>),
      disable: vi.fn(),
    } as unknown as BackgroundDeliveryPort;
    const handler = vi.fn();

    await deliverBackground(fixture, recordWith({ notify: handler } as unknown as TabPluginActivation), handler, { topic: 'schedules' });

    expect(fixture.disable).not.toHaveBeenCalled();
  });

  it('disables the plugin with the background origin when the guarded call fails', async () => {
    const error = new Error('handler blew up');
    const fixture = {
      records: () => [],
      timeoutMs: 1000,
      invoke: () => Promise.resolve({ status: 'failed', error } as PluginCallOutcome<void>),
      disable: vi.fn(),
    } as unknown as BackgroundDeliveryPort;
    const handler = vi.fn();

    await deliverBackground(fixture, recordWith({ notify: handler } as unknown as TabPluginActivation), handler, { topic: 'schedules' });

    expect(fixture.disable).toHaveBeenCalledWith(expect.anything(), error, BACKGROUND_ORIGIN);
  });

  it('makes no call at all for a channel with no handler, or a record with no activation', async () => {
    const { port: fixture, invoke } = port();

    await deliverBackground(fixture, recordWith({ notify: vi.fn() } as unknown as TabPluginActivation), undefined, { topic: 'schedules' });
    await deliverBackground(fixture, recordWith(undefined), vi.fn(), { topic: 'schedules' });

    expect(invoke).not.toHaveBeenCalled();
  });

  it('does not surface a rejection thrown by the host guard as a disable', async () => {
    const fixture = {
      records: () => [],
      timeoutMs: 1000,
      invoke: () => Promise.reject(new TabPluginRejection('answered elsewhere')),
      disable: vi.fn(),
    } as unknown as BackgroundDeliveryPort;
    const handler = vi.fn();

    await expect(deliverBackground(
      fixture, recordWith({ notify: handler } as unknown as TabPluginActivation), handler, { topic: 'schedules' },
    )).rejects.toThrow('answered elsewhere');
    expect(fixture.disable).not.toHaveBeenCalled();
  });
});
