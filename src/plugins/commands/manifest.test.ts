import { describe, expect, it } from 'vitest';
import { TAB_PLUGIN_API_VERSION } from '../api.js';
import { tabPluginCatalog } from '../catalog.js';
import { commandsManifest } from './manifest.js';
import { COMMANDS_PAYLOAD_SCHEMA_VERSION } from './shared.js';

describe('commands tab plugin manifest', () => {
  it('is the entry the production catalog holds', () => {
    expect(tabPluginCatalog).toContain(commandsManifest);
  });

  it('claims the commands command and topic, and declares exactly its six capabilities', () => {
    expect(commandsManifest.id).toBe('commands');
    expect(commandsManifest.command).toBe('commands');
    expect(commandsManifest.notifications).toEqual(['commands']);
    expect(commandsManifest.capabilities).toEqual([
      'openOrFocusTab',
      'updateTab',
      'topicData',
      'topicAction',
      'rejectRequest',
      'reportFailure',
    ]);
    expect(commandsManifest.capabilities).not.toContain('dockTab');
  });

  it('pins the API and payload versions to their constants', () => {
    expect(commandsManifest.apiVersion).toBe(TAB_PLUGIN_API_VERSION);
    expect(commandsManifest.payloadSchemaVersion).toBe(COMMANDS_PAYLOAD_SCHEMA_VERSION);
    expect(commandsManifest.payloadSchemaVersion).toBe(2);
  });
});
