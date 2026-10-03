import { describe, expect, it } from 'vitest';
import { playablePluginForExtension } from './index.js';

describe('playablePluginForExtension', () => {
  // Each plugin declares its own claimed types playable, so what `play` reaches is read off the
  // declaration rather than listed by the command that has to know about it.
  it.each([
    ['.cast', 'asciicast'],
    ['.mp4', 'video'],
    ['.mov', 'video'],
    ['.mp3', 'audio'],
    ['.flac', 'audio'],
  ])('answers the plugin that plays %s', (extension, plugin) => {
    expect(playablePluginForExtension(extension)).toBe(plugin);
  });

  it('matches the extension case-insensitively, as the registry does', () => {
    expect(playablePluginForExtension('.CAST')).toBe('asciicast');
    expect(playablePluginForExtension('.MP4')).toBe('video');
  });

  // An image viewer owns `.png` and plays nothing, so resolving to a plugin is not on its own enough:
  // a plugin declares its claimed types playable, and this plugin has not.
  it('answers undefined for a plugin-owned extension that is not playable', () => {
    expect(playablePluginForExtension('.png')).toBeUndefined();
    expect(playablePluginForExtension('.md')).toBeUndefined();
  });

  // The plain-text editor is a core opener rather than a plugin, so there is no declaration to ask.
  it('answers undefined for an extension a core opener claims', () => {
    expect(playablePluginForExtension('.txt')).toBeUndefined();
    expect(playablePluginForExtension('')).toBeUndefined();
  });
});