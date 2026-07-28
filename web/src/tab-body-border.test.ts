import { describe, expect, it } from 'vitest';
import { tabBodyBorder } from './tab-body-border';

describe('tabBodyBorder', () => {
  it('uses the tab color while focused', () => {
    expect(tabBodyBorder('#abcdef', true)).toBe('4px solid #abcdef');
  });

  it('uses the theme neutral while unfocused', () => {
    expect(tabBodyBorder('#abcdef', false)).toBe('4px solid var(--muted)');
  });
});
