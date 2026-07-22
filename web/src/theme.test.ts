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
