import { describe, expect, it, vi } from 'vitest';
import { TAB_PLUGIN_API_VERSION } from '@shared/plugins/api';
import type { TabPluginState } from './api';
import type { JanusClient } from '../shared/ws/ws';
import { createPluginHost } from './host';
import { createPluginClientCapabilities } from './plugin-client-capabilities';

function setup(tabState?: TabPluginState) {
  const send = vi.fn();
  const capabilities = createPluginClientCapabilities({
    host: createPluginHost(),
    pluginId: 'shell',
    label: 'shell-1',
    client: { send } as unknown as JanusClient,
    active: true,
    dock: null,
    onClose: vi.fn(),
    tabState,
  });
  return { capabilities, send };
}

describe('openConnection capability', () => {
  it('explicitly uses ask for the legacy tab transcript capability', () => {
    const { capabilities, send } = setup();

    capabilities.openAcpTranscript?.();

    expect(send).toHaveBeenCalledWith({
      method: 'openAcpTranscript', params: { acpRef: { scope: 'tab', label: 'shell-1', role: 'ask' } },
    });
  });

  it('sends a durable record id bound to the plugin tab label', () => {
    const { capabilities, send } = setup();

    capabilities.openConnection?.({ text: 'Agent: task.md', kind: 'acp', recordId: 'record-1' });

    expect(send).toHaveBeenCalledWith({
      method: 'openConnectionRecord',
      params: { tab: 'shell-1', recordId: 'record-1' },
    });
  });

  it('sends only a tab-scoped ACP reference that names this plugin tab', () => {
    const { capabilities, send } = setup();
    const acpRef = { scope: 'tab' as const, label: 'shell-1', role: 'ask' as const };

    capabilities.openConnection?.({ text: 'acp:opencode', kind: 'acp', acpRef });

    expect(send).toHaveBeenCalledWith({
      method: 'openConnectionRecord',
      params: { tab: 'shell-1', acpRef },
    });
  });

  it('leaves monitor, editor, and other-tab references snapshot-only', () => {
    const { capabilities, send } = setup();

    capabilities.openConnection?.({ text: 'monitor', kind: 'acp', acpRef: { scope: 'monitor', name: 'watch' } });
    capabilities.openConnection?.({ text: 'reviewer', kind: 'acp', acpRef: { scope: 'editor', label: 'notes', persona: 'reviewer' } });
    capabilities.openConnection?.({ text: 'acp:other', kind: 'acp', acpRef: { scope: 'tab', label: 'other', role: 'ask' } });

    expect(send).not.toHaveBeenCalled();
  });

  it('exposes no raw client or general RPC method', () => {
    const { capabilities } = setup();

    expect(capabilities).not.toHaveProperty('client');
    expect(capabilities).not.toHaveProperty('send');
    expect(capabilities).not.toHaveProperty('rpc');
  });

  it('provides openConnection under plugin API v3', () => {
    expect(TAB_PLUGIN_API_VERSION).toBe(3);
  });

  it('exposes the app-owned state accessor without changing the additive API version', () => {
    const tabState: TabPluginState = { get: vi.fn(), set: vi.fn(), delete: vi.fn() };

    expect(setup(tabState).capabilities.tabState).toBe(tabState);
    expect(TAB_PLUGIN_API_VERSION).toBe(3);
  });
});
