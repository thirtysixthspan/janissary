import { describe, it, expect } from 'vitest';
import { tabPluginLoaders } from './loaders.js';
import { tabPluginCatalog } from './catalog.js';

const ids = Object.keys(tabPluginLoaders);

describe('tabPluginLoaders', () => {
  // The registry is the only thing standing between a bundled plugin and its activation module, and
  // a wrong path here is invisible until a user opens that tab — the module is never imported at
  // boot. So resolve every entry rather than trusting the paths to be right.
  it.each(ids)('resolves %s to a module that activates', async (id) => {
    const module = await tabPluginLoaders[id]();
    expect(typeof module.activate).toBe('function');
  });

  it('holds a loader for every bundled plugin and nothing beyond them', () => {
    const byName = (a: string, b: string) => a.localeCompare(b);
    expect(ids.toSorted(byName)).toEqual(tabPluginCatalog.map((d) => d.id).toSorted(byName));
  });
});
