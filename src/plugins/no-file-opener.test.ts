import { describe, expect, it } from 'vitest';
import { TabPluginRejection, type TabPluginServerCapabilities } from './api.js';
import { noFileOpener } from './no-file-opener.js';

const capabilities = {
  rejectRequest: (reason: string): never => { throw new TabPluginRejection(reason); },
} as unknown as TabPluginServerCapabilities;

describe('noFileOpener', () => {
  it('rejects the inline presentation, naming the plugin', () => {
    expect(() => noFileOpener('lists').inline('/tmp/a.txt', capabilities))
      .toThrow(new TabPluginRejection('lists opens no files'));
  });

  it('rejects the external presentation with the same reason', () => {
    expect(() => noFileOpener('lists').external('/tmp/a.txt', capabilities))
      .toThrow(new TabPluginRejection('lists opens no files'));
  });

  it('offers no edit presentation', () => {
    expect(noFileOpener('lists').edit).toBeUndefined();
  });
});
