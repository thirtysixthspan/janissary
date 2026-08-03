import { describe, expect, it, vi } from 'vitest';
import type { Managers } from '../managers.js';
import type { TabPluginActivation, TabPluginDeclaration } from './api.js';
import { TAB_PLUGIN_API_VERSION } from './api.js';
import { TabPluginHost } from './host.js';

const declaration: TabPluginDeclaration = {
  id: 'fixture', version: '1.0.0', apiVersion: TAB_PLUGIN_API_VERSION,
  payloadSchemaVersion: 1, tabLabelPrefix: 'fixture', fileExtensions: {}, capabilities: [],
};

function setup(intentHandler?: TabPluginActivation['intent']) {
  const plugin = {
    id: 'fixture', instanceKey: 'server-owned', schemaVersion: 1,
    payload: { secret: 'server payload' }, fileRefs: [], sourceLabel: 'janus',
  };
  const tabs = [
    { label: 'janus', dotColor: '#fff', log: [] },
    { label: 'fixture', dotColor: '#123', log: [], plugin },
  ];
  const closeTab = vi.fn();
  const managers = {
    tab: { tabs, append: vi.fn(), closeTab, cur: () => tabs[0] },
  } as unknown as Managers;
  const intent = vi.fn(intentHandler ?? ((request) => ({
    intent: request.intent, payload: request.payload, tabPayload: request.tabPayload,
  })));
  const activation: TabPluginActivation = {
    isPayload: () => true,
    opener: { inline: () => {}, external: () => {} },
    intent,
  };
  const host = new TabPluginHost(managers, [declaration], {
    fixture: async () => ({ activate: () => activation }),
  });
  return { closeTab, host, intent, managers, tabs };
}

describe('TabPluginHost intent routing', () => {
  it('derives plugin identity and payload from the server tab record', async () => {
    const fixture = setup();
    await expect(fixture.host.intent('fixture', 'echo', { client: 'payload' })).resolves.toEqual({
      intent: 'echo',
      payload: { client: 'payload' },
      tabPayload: { secret: 'server payload' },
    });
    expect(fixture.intent).toHaveBeenCalledWith(
      expect.objectContaining({ tab: 'fixture', tabPayload: { secret: 'server payload' } }),
      expect.any(Object),
    );
  });

  it('rejects unknown, closed, and non-plugin tabs', async () => {
    const fixture = setup();
    await expect(fixture.host.intent('missing', 'echo', {}))
      .rejects.toThrow('Plugin tab "missing" not found');
    await expect(fixture.host.intent('janus', 'echo', {}))
      .rejects.toThrow('Plugin tab "janus" not found');
    fixture.tabs.splice(1, 1);
    await expect(fixture.host.intent('fixture', 'echo', {}))
      .rejects.toThrow('Plugin tab "fixture" not found');
  });

  it('returns the recorded disabled reason without calling behavior again', async () => {
    const fixture = setup();
    await fixture.host.intent('fixture', 'echo', {});
    fixture.host.clientFailed('fixture', 'client chunk rejected');
    await expect(fixture.host.intent('fixture', 'echo', {}))
      .rejects.toThrow('Tab plugin "fixture" disabled: client chunk rejected.');
    expect(fixture.intent).toHaveBeenCalledOnce();
    expect(fixture.closeTab).toHaveBeenCalledWith(1);
  });

  // The generic ingress only validates that `tab`, `intent`, and `payload` are present, so anything
  // deeper is the plugin's own call. A plugin answering "that request was wrong" must not be able to
  // take itself down: otherwise one malformed client message ends video for the whole session.
  it('returns a plugin rejection as an ordinary error without disabling anything', async () => {
    const fixture = setup((_request, capabilities) =>
      capabilities.rejectRequest('invalid capture-frame payload'));

    await expect(fixture.host.intent('fixture', 'capture-frame', { dataUrl: 7 }))
      .rejects.toThrow('invalid capture-frame payload');

    expect(fixture.host.statusFor('fixture')).toMatchObject({ state: 'active' });
    expect(fixture.closeTab).not.toHaveBeenCalled();
    await expect(fixture.host.intent('fixture', 'capture-frame', { dataUrl: 7 }))
      .rejects.toThrow('invalid capture-frame payload');
    expect(fixture.intent).toHaveBeenCalledTimes(2);
  });

  it('still disables the plugin when an intent reports a real failure', async () => {
    const fixture = setup((_request, capabilities) => capabilities.reportFailure('decoder exploded'));

    await expect(fixture.host.intent('fixture', 'capture-frame', {}))
      .rejects.toThrow('Tab plugin "fixture" disabled: decoder exploded.');

    expect(fixture.host.statusFor('fixture')).toMatchObject({ state: 'disabled' });
    expect(fixture.closeTab).toHaveBeenCalledWith(1);
  });

  it('disables a plugin whose intent result cannot cross the JSON wire', async () => {
    const fixture = setup(() => 1n);
    await expect(fixture.host.intent('fixture', 'echo', {}))
      .rejects.toThrow('Tab plugin "fixture" disabled: produced an invalid intent result.');
    expect(fixture.host.statusFor('fixture')).toMatchObject({
      state: 'disabled', reason: 'produced an invalid intent result',
    });
  });

  it('rejects a tab whose plugin id is not in the catalog', async () => {
    const fixture = setup();
    fixture.tabs[1].plugin!.id = 'ghost';
    await expect(fixture.host.intent('fixture', 'echo', {}))
      .rejects.toThrow('Unknown tab plugin "ghost"');
  });
});
