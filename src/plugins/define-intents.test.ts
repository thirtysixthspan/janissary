import { describe, expect, it, vi } from 'vitest';
import { TabPluginRejection, type TabPluginServerCapabilities } from './api.js';
import { defineIntents } from './define-intents.js';

type FixturePayload = { path: string };
type FixtureEditPayload = { dataUrl: string };
type FixtureUnionPayload = { kind: 'plain'; path: string } | { kind: 'edit'; dataUrl: string };

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

function isFixtureUnionPayload(value: unknown): value is FixtureUnionPayload {
  return typeof value === 'object' && value !== null && 'kind' in value;
}

const isEditTab = (tab: FixtureUnionPayload): tab is FixtureUnionPayload & { kind: 'edit' } => tab.kind === 'edit';

const unionIntents = defineIntents('fixture', isFixtureUnionPayload, {
  'save-edit': {
    payload: isEditPayload,
    tab: isEditTab,
    run: (tabPayload, payload: FixtureEditPayload) => ({ written: `${tabPayload.dataUrl}:${payload.dataUrl}` }),
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

  it('rejects an intent named after an inherited object property as unknown', () => {
    const { capabilities, reject } = fakeCapabilities();
    expect(() => intents(request('toString', {}), capabilities))
      .toThrow('unknown fixture intent "toString"');
    expect(reject).toHaveBeenCalledWith('unknown fixture intent "toString"');
  });

  it('rejects a payload the named entry\'s guard does not accept', () => {
    const { capabilities, reject } = fakeCapabilities();
    expect(() => intents(request('save-edit', { dataUrl: 7 }), capabilities))
      .toThrow('invalid save-edit payload');
    expect(reject).toHaveBeenCalledWith('invalid save-edit payload');
  });

  it('rejects an entry whose tab guard does not accept the tab payload it came from', () => {
    const { capabilities, reject } = fakeCapabilities();
    expect(() => unionIntents(request('save-edit', { dataUrl: 'abc' }, { kind: 'plain', path: '/tmp/x' }), capabilities))
      .toThrow('invalid save-edit payload');
    expect(reject).toHaveBeenCalledWith('invalid save-edit payload');
  });

  it('runs an entry whose tab guard accepts, with the narrowed tab payload', () => {
    const { capabilities } = fakeCapabilities();
    expect(unionIntents(request('save-edit', { dataUrl: 'abc' }, { kind: 'edit', dataUrl: 'tab' }), capabilities))
      .toEqual({ written: 'tab:abc' });
  });
});
