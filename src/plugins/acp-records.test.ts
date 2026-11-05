import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AcpOptions, PromptHandlers } from '../acp/types.js';
import { createControllerTestProject } from '../controller/test-project.js';
import { seedRootTab } from '../tab/root-tab-test-fixture.js';
import { TabPluginHost } from './host.js';
import { TAB_PLUGIN_API_VERSION } from './api.js';
import type { TabPluginDeclaration } from './api.js';

const mock = vi.hoisted(() => ({ connect: vi.fn() }));
vi.mock('../acp/index.js', () => ({ connectAcp: mock.connect }));
vi.mock('../pty.js');
const project = createControllerTestProject();
afterEach(async () => { await project.dispose(); vi.clearAllMocks(); });

describe('plugin-owned core record teardown', () => {
  it.each(['failure', 'shutdown'])('closes active and idle records on %s', async (reason) => {
    const controller = project.create();
    const { managers } = controller;
    seedRootTab(managers.tab);
    const pending: PromptHandlers[] = [];
    mock.connect.mockImplementation((options: AcpOptions) => {
      options.onConnect?.({});
      return { prompt: (_text: string, handlers: PromptHandlers) => { pending.push(handlers); }, kill: vi.fn(), cancel: async () => {}, shutdown: async () => {} };
    });
    const declaration: TabPluginDeclaration = {
      id: 'record-fixture', version: '1.0.0', apiVersion: TAB_PLUGIN_API_VERSION,
      payloadSchemaVersion: 1, tabLabelPrefix: 'fixture', fileExtensions: {},
      capabilities: ['openOrFocusTab'],
    };
    managers.plugins.dispose();
    managers.plugins = new TabPluginHost(managers, [declaration], {
      'record-fixture': async () => ({ activate: () => ({
        isPayload: () => true,
        opener: {
          inline: (_file, capabilities) => {
            capabilities.openOrFocusTab('active', () => ({ title: 'Active', payload: {} }));
            capabilities.openOrFocusTab('idle', () => ({ title: 'Idle', payload: {} }));
          }, external: () => {},
        }, intent: () => { throw new Error('fixture failure'); },
      }) }),
    });
    await managers.plugins.runOpener('record-fixture', 'inline', 'fixture', { label: 'janus' });
    const tabs = managers.tab.tabs.filter((tab) => tab.plugin?.id === 'record-fixture');
    const active = managers.acp.prompt(tabs[0].label, 'held');
    const idle = managers.acp.prompt(tabs[1].label, 'answer me');
    pending[1].onChunk('answered');
    pending[1].onEnd('end_turn');
    await idle;
    const ids = tabs.map((tab) => tab.runtime!.acpRecordId!);
    if (reason === 'failure') await expect(managers.plugins.intent(tabs[0].label, 'fail', null)).rejects.toThrow();
    else await controller.shutdown();
    await expect(active).resolves.toBe('ACP session closed.');
    expect(ids.map((id) => managers.acpRecords.window(id)?.status)).toEqual(['Closed', 'Closed']);
    pending[0].onChunk('late');
    expect(managers.acpRecords.window(ids[0])?.blocks[0].answer).toBe('ACP session closed.');
  });
});
