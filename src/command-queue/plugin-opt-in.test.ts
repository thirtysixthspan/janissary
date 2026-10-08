import { describe, expect, it } from 'vitest';
import { activatePlugin } from '../plugins/activate.js';
import { TAB_PLUGIN_API_VERSION, noFileOpener } from '../plugins/api.js';
import type { TabPluginDeclaration } from '../plugins/api.js';
import { declaresCommandQueue } from './support.js';

describe('independent plugin queue opt-in', () => {
  it.each([false, true])('activates a command bar with queue support set to %s', async (queued) => {
    const declaration: TabPluginDeclaration = {
      id: 'any-tab', version: '1.0.0', apiVersion: TAB_PLUGIN_API_VERSION,
      payloadSchemaVersion: 1, tabLabelPrefix: 'any-tab', fileExtensions: {},
      hostsCommandBar: true,
      capabilities: queued ? ['queueLine', 'nextQueuedLine'] : [],
    };
    const activation = {
      isPayload: (_payload: unknown): _payload is object => true,
      opener: noFileOpener('any-tab'), intent: () => null,
    };
    const result = await activatePlugin(declaration, async () => ({ activate: () => activation }), 1000);
    expect(result.activation).toBe(activation);
    expect(declaresCommandQueue(declaration)).toBe(queued);
  });
});
