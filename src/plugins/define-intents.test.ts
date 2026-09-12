import { describe, expect, it, vi } from 'vitest';
import { TabPluginRejection, type TabPluginServerCapabilities } from './api.js';
import { defineIntents } from './define-intents.js';

type FixturePayload = { path: string };
type FixtureEditPayload = { dataUrl: string };

function isFixturePayload(value: unknown): value is FixturePayload {
  return typeof value === 'object' && value !== null && 'path' in value;
}

function isEditPayload(value: unknown): value is FixtureEditPayload {
  return typeof value === 'object' && value !== null
    && 'dataUrl' in value && typeof (value as FixtureEditPayload).dataUrl === 'string';
}

function fakeCapabilities() {
  const reject = vi.fn((reason: string): never => { throw new TabPluginRejection(reason); });
  const report = vi.fn((reason: unknown): never => { throw new Error(String(reason)); });
  return { reject, report, capabilities: { rejectRequest: reject, reportFailure: report } as unknown as TabPluginServerCapabilities };
}

function request(intent: string, payload: unknown, tabPayload?: unknown) {
  return { tab: 'tab', intent, payload, tabPayload: tabPayload ?? { path: '/tmp/x' } };
}

const intents = defineIntents('fixture', isFixturePayload, {
  'save-edit': {
    payload: isEditPayload,
    run: (tabPayload, payload: FixtureEditPayload) => ({ written: `${tabPayload.path}:${payload.dataUrl}` }),
  },
});

describe('defineIntents', () => {
  it('runs the named entry with the narrowed tab payload and the guarded payload', () => {
    const { capabilities } = fakeCapabilities();
    expect(intents(request('save-edit', { dataUrl: 'abc' }), capabilities))
      .toEqual({ written: '/tmp/x:abc' });
  });

  it('reports the tab payload as a failure when the plugin\'s own guard rejects it', () => {
    const { capabilities, report } = fakeCapabilities();
    expect(() => intents(request('save-edit', { dataUrl: 'abc' }, { wrong: true }), capabilities))
      .toThrow('invalid fixture tab payload');
    expect(report).toHaveBeenCalledWith('invalid fixture tab payload');
  });

  it('rejects an intent name the table does not carry', () => {
    const { capabilities, reject } = fakeCapabilities();
    expect(() => intents(request('no-such-intent', {}), capabilities))
      .toThrow('unknown fixture intent "no-such-intent"');
    expect(reject).toHaveBeenCalledWith('unknown fixture intent "no-such-intent"');
  });

  it('rejects a payload the named entry\'s guard does not accept', () => {
    const { capabilities, reject } = fakeCapabilities();
    expect(() => intents(request('save-edit', { dataUrl: 7 }), capabilities))
      .toThrow('invalid save-edit payload');
    expect(reject).toHaveBeenCalledWith('invalid save-edit payload');
  });
});
