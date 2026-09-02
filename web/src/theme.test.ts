import { describe, expect, it } from 'vitest';
import theme from './theme.css?raw';
import pluginShared from './plugins/shared.css?raw';

describe('editor theme', () => {
  it('wraps editor sentences at word boundaries', () => {
    const editorContentRule = theme
      .split('\n')
      .find((line) => line.startsWith('.editor-content'));

    expect(editorContentRule).toContain('overflow-wrap: break-word');
    expect(editorContentRule).not.toContain('word-break: break-all');
  });
});

describe('metadata theme', () => {
  it('makes every host metadata text container selectable', () => {
    const metadataRule = theme.match(
      /\.tab-meta, \.monitor-meta, \.files-meta, \.editor-meta \{[^}]+\}/,
    )?.[0];

    expect(metadataRule).toBeDefined();
    expect(metadataRule).toContain('user-select: text');
    expect(metadataRule).not.toContain('user-select: none');
  });

  it('stacks the docked file navigator header onto two lines', () => {
    const dockedRule = theme.match(/\.files-header--docked \{[^}]+\}/)?.[0];
    const actionRule = theme.match(
      /\.tab-meta-actions, \.monitor-actions, \.editor-actions, \.files-actions \{[^}]+\}/,
    )?.[0];

    expect(dockedRule).toContain('flex-direction: column');
    expect(actionRule).toContain('margin-left: auto');
  });

  it('keeps host metadata action groups at the right edge', () => {
    const actionRule = theme.match(
      /\.tab-meta-actions, \.monitor-actions, \.editor-actions, \.files-actions \{[^}]+\}/,
    )?.[0];

    expect(actionRule).toBeDefined();
    expect(actionRule).toContain('margin-left: auto');
  });

  // The plugin half of the two rules above. Splitting them is what keeps a plugin's styling inside
  // its own lazy chunk, so the host stylesheet must not carry a plugin selector back in.
  it('leaves plugin metadata containers to the plugin stylesheets', () => {
    expect(pluginShared).toContain('.plugin-meta');
    expect(pluginShared).toContain('user-select: text');
    expect(pluginShared).toContain('.plugin-actions');
    expect(theme).not.toContain('.plugin-meta');
    expect(theme).not.toContain('.plugin-actions');
  });
});

describe('plugin stylesheet ownership', () => {
  it('keeps every plugin-owned selector out of the application stylesheet', () => {
    for (const selector of ['.plugin-tab', '.plugin-stage', '.image-edit-', '.image-crop-', '.audio-', '.markdown-stage', '.page-tab', '.schedules-']) {
      expect(theme).not.toContain(selector);
    }
  });

  // `.tab-split` is rendered by the host's own SplitTabButton as well as by a plugin, so it is the
  // one control in this family that stays with the host.
  it('keeps the host-rendered split control in the application stylesheet', () => {
    expect(theme).toContain('.tab-split');
  });
});

describe('tab strip theme', () => {
  it('makes tab labels non-selectable', () => {
    const tabRule = theme.match(/^\.tab \{[^}]+\}/m)?.[0];

    expect(tabRule).toBeDefined();
    expect(tabRule).toContain('user-select: none');
  });
});
