import { afterEach, describe, expect, it } from 'vitest';
import { shellTerminalTheme } from './shell-terminal-theme';

const PROPERTIES = ['--bg', '--fg', '--editor-selection', '--terminal-bg', '--terminal-fg'];

describe('shellTerminalTheme', () => {
  afterEach(() => {
    for (const name of PROPERTIES) document.documentElement.style.removeProperty(name);
  });

  it('paints the terminal in the application palette rather than the shared terminal colors', () => {
    const root = document.documentElement;
    root.style.setProperty('--bg', '#ffffff');
    root.style.setProperty('--fg', '#1f2328');
    root.style.setProperty('--editor-selection', 'rgb(9 105 218 / 25%)');
    root.style.setProperty('--terminal-bg', '#17181b');
    root.style.setProperty('--terminal-fg', '#e4e5e7');

    expect(shellTerminalTheme()).toEqual({
      background: '#ffffff',
      foreground: '#1f2328',
      cursor: '#1f2328',
      cursorAccent: '#ffffff',
      selectionBackground: 'rgb(9 105 218 / 25%)',
    });
  });

  it('falls back to the terminal colors when the application palette is unset', () => {
    const root = document.documentElement;
    root.style.setProperty('--terminal-bg', '#101010');
    root.style.setProperty('--terminal-fg', '#efefef');

    expect(shellTerminalTheme()).toEqual({
      background: '#101010',
      foreground: '#efefef',
      cursor: '#efefef',
      cursorAccent: '#101010',
    });
  });
});
