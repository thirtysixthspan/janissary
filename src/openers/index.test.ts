import { describe, expect, it } from 'vitest';
import { playablePluginForExtension } from './index.js';

describe('playablePluginForExtension', () => {
  it('answers the plugin that owns a playable extension', () => {
    expect(playablePluginForExtension('.cast')).toBe('asciicast');
  });

  it('matches the extension case-insensitively, as the registry does', () => {
    expect(playablePluginForExtension('.CAST')).toBe('asciicast');
  });

  // An image viewer owns `.png` and plays nothing, so resolving to a plugin is not on its own enough:
  // a plugin declares its claimed types playable, and this plugin has not.
  it('answers undefined for a plugin-owned extension that is not playable', () => {
    expect(playablePluginForExtension('.png')).toBeUndefined();
  });

  // The plain-text editor is a core opener rather than a plugin, so there is no declaration to ask.
  it('answers undefined for an extension a core opener claims', () => {
    expect(playablePluginForExtension('.txt')).toBeUndefined();
    expect(playablePluginForExtension('')).toBeUndefined();
  });
});