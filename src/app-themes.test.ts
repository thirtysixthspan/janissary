import { describe, it, expect } from 'vitest';
import { APP_THEMES, DEFAULT_APP_THEME } from './app-themes.js';

describe('app-themes', () => {
  it('exports the built-in theme names', () => {
    expect(APP_THEMES).toEqual([
      'dark',
      'light',
      'solarized-dark',
      'solarized-light',
      'nord',
      'dracula',
    ]);
  });

  it('defaults to dark, which is in the list', () => {
    expect(DEFAULT_APP_THEME).toBe('dark');
    expect(APP_THEMES).toContain(DEFAULT_APP_THEME);
  });
});
