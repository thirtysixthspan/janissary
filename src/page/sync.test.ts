import { describe, it, expect } from 'vitest';
import { syncPageSnapshot } from './sync.js';
import { TabManager } from '../tab/manager.js';
import type { Managers } from '../managers.js';

function setup() {
  const managers = {} as Managers;
  managers.tab = new TabManager(managers);
  managers.tab.openPageTab({ url: 'https://example.org', domain: 'example.org' });
  return { managers };
}

describe('syncPageSnapshot', () => {
  it('caches the visible text with a fresh timestamp', () => {
    const { managers } = setup();
    const before = Date.now();
    syncPageSnapshot(managers, 'https://example.org', 'visible text');
    const tab = managers.tab.tabs.find((t) => t.page);
    expect(tab?.pageSnapshot?.text).toBe('visible text');
    expect(tab?.pageSnapshot?.capturedAt).toBeGreaterThanOrEqual(before);
  });

  it('no-ops for an unknown url', () => {
    const { managers } = setup();
    expect(() => syncPageSnapshot(managers, 'https://unknown.example', 'x')).not.toThrow();
    const tab = managers.tab.tabs.find((t) => t.page);
    expect(tab?.pageSnapshot).toBeUndefined();
  });
});
