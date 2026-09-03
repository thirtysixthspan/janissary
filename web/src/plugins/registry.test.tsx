import { describe, expect, it } from 'vitest';
import { IMAGE_PAYLOAD_SCHEMA_VERSION } from '@shared/plugins/image/shared';
import { MARKDOWN_PAYLOAD_SCHEMA_VERSION } from '@shared/plugins/markdown/shared';
import { SCHEDULES_PAYLOAD_SCHEMA_VERSION } from '@shared/plugins/schedules/shared';
import { VIDEO_PAYLOAD_SCHEMA_VERSION } from '@shared/plugins/video/shared';
import { CONVERSATIONS_PAYLOAD_SCHEMA_VERSION } from '@shared/plugins/conversations/shared';
import { clientPluginLoaders, clientPluginRegistry } from './registry';

// The registry hardcodes each plugin's payload schema version so importing a shared contract cannot
// pull plugin guards into the entry bundle. That duplication is only safe while something checks it,
// which is this file's whole job — a test never ships to the browser, so it may import freely.
describe('client plugin registry', () => {
  it('pins every registered schema literal to its plugin\'s own constant', () => {
    expect(clientPluginRegistry.get('image')?.schemaVersion).toBe(IMAGE_PAYLOAD_SCHEMA_VERSION);
    expect(clientPluginRegistry.get('conversations')?.schemaVersion)
      .toBe(CONVERSATIONS_PAYLOAD_SCHEMA_VERSION);
    expect(clientPluginRegistry.get('markdown')?.schemaVersion).toBe(MARKDOWN_PAYLOAD_SCHEMA_VERSION);
    expect(clientPluginRegistry.get('schedules')?.schemaVersion).toBe(SCHEDULES_PAYLOAD_SCHEMA_VERSION);
    expect(clientPluginRegistry.get('video')?.schemaVersion).toBe(VIDEO_PAYLOAD_SCHEMA_VERSION);
  });

  it('registers exactly the plugins it declares loaders for', () => {
    expect([...clientPluginRegistry.keys()].toSorted((a, b) => a.localeCompare(b)))
      .toEqual(Object.keys(clientPluginLoaders).toSorted((a, b) => a.localeCompare(b)));
  });

  // Each entry now imports its own stylesheet, so a stylesheet that is missing, misnamed, or reaches
  // for a path the plugin import boundary rejects breaks that plugin's loader rather than showing up
  // as a silently unstyled tab the first time somebody opens it.
  it('loads every plugin entry with its stylesheet imports resolved', async () => {
    for (const [id, load] of Object.entries(clientPluginLoaders)) {
      const module = await load();

      expect(module.default, id).toBeTypeOf('function');
      expect(module.isPayload, id).toBeTypeOf('function');
    }
  });
});
