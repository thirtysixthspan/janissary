// The two colors a pty-backed terminal renders with, read from the same custom properties the live
// terminal themes itself from, so the value reported to the server and the value on screen cannot
// disagree. The server cannot work either out for itself: the palettes live only in the web
// stylesheet, one block per app theme, and the server holds nothing but a theme's name.

export type TerminalColors = {
  fg: string;
  bg: string;
};

const DEFAULT_FG = '#e4e5e7';
const DEFAULT_BG = '#17181b';

export function terminalColors(): TerminalColors {
  const styles = getComputedStyle(document.documentElement);
  return {
    fg: styles.getPropertyValue('--terminal-fg').trim() || DEFAULT_FG,
    bg: styles.getPropertyValue('--terminal-bg').trim() || DEFAULT_BG,
  };
}
