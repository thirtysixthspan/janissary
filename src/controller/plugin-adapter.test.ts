import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Managers } from '../managers.js';
import { TabManager } from '../tab/manager.js';
import { TAB_PLUGIN_API_VERSION, type TabPluginDeclaration } from '../plugins/api.js';
import { TabPluginHost } from '../plugins/host.js';
import { createPluginControllerAdapter } from './plugin-adapter.js';

const hosts: TabPluginHost[] = [];
afterEach(() => {
  for (const host of hosts) host.dispose();
  hosts.length = 0;
});

function fixture(multiple = false) {
  const declaration: TabPluginDeclaration = {
    id: 'fixture', version: '1.0.0', apiVersion: TAB_PLUGIN_API_VERSION,
    payloadSchemaVersion: 1, tabLabelPrefix: 'fixture', fileExtensions: {},
    defaultMenu: { label: 'Chat about this' }, capabilities: [],
  };
  const managers = {} as Managers;
  managers.tab = new TabManager(managers);
  const handler = vi.fn();
  const loader = vi.fn(async () => ({ activate: () => ({
    isPayload: () => true, intent: () => null,
    opener: { inline: () => {}, external: () => {} }, defaultMenuAction: handler,
  }) }));
  const declarations = multiple ? [declaration, { ...declaration, id: 'second' }] : [declaration];
  const host = new TabPluginHost(managers, declarations, { fixture: loader, second: loader });
  hosts.push(host);
  managers.plugins = host;
  const adapter = createPluginControllerAdapter(managers);
  const origin = { label: managers.tab.tabs[0].label, command: 'default menu' };
  return { host, adapter, handler, loader, origin };
}

describe('default-menu plugin eligibility', () => {
  it('offers declared contributions without loading or activating them', () => {
    const { host, adapter, loader } = fixture();
    expect(adapter.defaultMenuSelectionAction()).toEqual({ label: 'Chat about this' });
    expect(host.statusFor('fixture')?.state).toBe('declared');
    expect(loader).not.toHaveBeenCalled();
  });

  it('keeps active contributions eligible without reactivating them', async () => {
    const { host, adapter, handler, loader, origin } = fixture();
    await host.runDefaultMenuAction('fixture', 'Chat about this', 'selection', origin);
    expect(host.statusFor('fixture')?.state).toBe('active');
    expect(adapter.defaultMenuSelectionAction()).toEqual({ label: 'Chat about this' });
    adapter.runDefaultMenuSelectionAction('next selection', 'Chat about this');
    await vi.waitFor(() => { expect(handler).toHaveBeenCalledTimes(2); });
    expect(handler.mock.calls[1][0]).toBe('next selection');
    expect(loader).toHaveBeenCalledOnce();
  });

  it('omits a disabled contribution and refuses an action offered before failure', async () => {
    const { host, adapter, handler, origin } = fixture();
    const offered = adapter.defaultMenuSelectionAction()!;
    handler.mockImplementation(() => { throw new Error('handler failed'); });
    await host.runDefaultMenuAction('fixture', offered.label, 'selection', origin);
    expect(host.statusFor('fixture')?.state).toBe('disabled');
    expect(adapter.defaultMenuSelectionAction()).toBeNull();
    const dispatch = vi.spyOn(host, 'runDefaultMenuAction');
    adapter.runDefaultMenuSelectionAction('stale selection', offered.label);
    expect(dispatch).not.toHaveBeenCalled();
    expect(handler).toHaveBeenCalledOnce();
  });

  it('refuses unknown labels and multiple eligible contributors without dispatching', () => {
    const single = fixture();
    const singleDispatch = vi.spyOn(single.host, 'runDefaultMenuAction');
    single.adapter.runDefaultMenuSelectionAction('selection', 'Unknown action');
    expect(singleDispatch).not.toHaveBeenCalled();
    const multiple = fixture(true);
    const multipleDispatch = vi.spyOn(multiple.host, 'runDefaultMenuAction');
    expect(multiple.adapter.defaultMenuSelectionAction()).toBeNull();
    multiple.adapter.runDefaultMenuSelectionAction('selection', 'Chat about this');
    expect(multipleDispatch).not.toHaveBeenCalled();
    expect(multiple.loader).not.toHaveBeenCalled();
  });
});
