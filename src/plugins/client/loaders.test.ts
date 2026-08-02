import { describe, expect, it } from 'vitest';
import { pluginManifests } from '../manifests';
import { clientPluginLoaders } from './loaders';
import { clientPluginIds } from './registry';

describe('client plugin registry', () => {
  it('has one literal loader for every production manifest without importing behavior', () => {
    expect(clientPluginIds()).toEqual(pluginManifests.map((manifest) => manifest.id).toSorted((a, b) => a.localeCompare(b)));
    expect(Object.keys(clientPluginLoaders).toSorted((a, b) => a.localeCompare(b))).toEqual(['video']);
  });
});
