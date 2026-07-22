import { describe, expect, it } from 'vitest';
import theme from './theme.css?raw';

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
  it('makes every metadata text container selectable', () => {
    const metadataRule = theme.match(
      /\.image-meta, \.page-meta, \.tab-meta, \.monitor-meta, \.files-meta, \.editor-meta \{[^}]+\}/,
    )?.[0];

    expect(metadataRule).toBeDefined();
    expect(metadataRule).toContain('user-select: text');
    expect(metadataRule).not.toContain('user-select: none');
  });
});

describe('tab strip theme', () => {
  it('makes tab labels non-selectable', () => {
    const tabRule = theme.match(/^\.tab \{[^}]+\}/m)?.[0];

    expect(tabRule).toBeDefined();
    expect(tabRule).toContain('user-select: none');
  });
});
