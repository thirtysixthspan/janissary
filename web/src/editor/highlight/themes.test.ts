import { describe, it, expect, afterEach } from 'vitest';
import { SYNTAX_THEMES } from '@shared/syntax-themes';
import { THEME_CSS, applySyntaxTheme } from './themes';

afterEach(() => {
  document.querySelector('#syntax-theme')?.remove();
});

describe('THEME_CSS', () => {
  it('has non-empty CSS for every name in SYNTAX_THEMES', () => {
    expect(Object.keys(THEME_CSS)).toEqual(SYNTAX_THEMES);
    for (const name of SYNTAX_THEMES) expect(THEME_CSS[name].length).toBeGreaterThan(0);
  });
});

describe('applySyntaxTheme', () => {
  it('creates a single #syntax-theme style element with the theme CSS', () => {
    applySyntaxTheme('nord');
    const style = document.querySelector('#syntax-theme');
    expect(style).not.toBeNull();
    expect(style!.textContent).toBe(THEME_CSS.nord);
  });

  it('swaps the content in place rather than adding another element', () => {
    applySyntaxTheme('nord');
    applySyntaxTheme('monokai');
    expect(document.querySelectorAll('style#syntax-theme')).toHaveLength(1);
    expect(document.querySelector('#syntax-theme')!.textContent).toBe(THEME_CSS.monokai);
  });
});
