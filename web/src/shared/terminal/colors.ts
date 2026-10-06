// The colors a pty-backed terminal renders with, read from the same custom properties the live
// terminal themes itself from, so the value reported to the server and the value on screen cannot
// disagree. The server cannot work any out for itself: the palettes live only in the web
// stylesheet, one block per app theme, and the server holds nothing but a theme's name.

export type TerminalColors = {
  fg: string;
  bg: string;
  // The 16 ANSI colors, in the order the standard numbers them: black, red, green, yellow, blue,
  // magenta, cyan, white, then the same eight "bright". Optional because a terminal surface older
  // than the palette reports without it, and a recording made then keeps the header it always had.
  palette?: readonly string[];
};

const DEFAULT_FG = '#e4e5e7';
const DEFAULT_BG = '#17181b';

// The ANSI order, against the `xterm.js` names its theme option takes. Each entry is the CSS custom
// property the colour is read from and the fallback used when a theme declares no value for it.
const ANSI_COLORS: readonly [xterm: string, property: string, fallback: string][] = [
  ['black', '--terminal-black', '#2e3436'],
  ['red', '--terminal-red', '#cc0000'],
  ['green', '--terminal-green', '#4e9a06'],
  ['yellow', '--terminal-yellow', '#c4a000'],
  ['blue', '--terminal-blue', '#3465a4'],
  ['magenta', '--terminal-magenta', '#75507b'],
  ['cyan', '--terminal-cyan', '#06989a'],
  ['white', '--terminal-white', '#d3d7cf'],
  ['brightBlack', '--terminal-bright-black', '#555753'],
  ['brightRed', '--terminal-bright-red', '#ef2929'],
  ['brightGreen', '--terminal-bright-green', '#8ae234'],
  ['brightYellow', '--terminal-bright-yellow', '#fce94f'],
  ['brightBlue', '--terminal-bright-blue', '#729fcf'],
  ['brightMagenta', '--terminal-bright-magenta', '#ad7fa8'],
  ['brightCyan', '--terminal-bright-cyan', '#34e2e2'],
  ['brightWhite', '--terminal-bright-white', '#eeeeec'],
];

export function terminalColors(): TerminalColors {
  const styles = getComputedStyle(document.documentElement);
  return {
    fg: styles.getPropertyValue('--terminal-fg').trim() || DEFAULT_FG,
    bg: styles.getPropertyValue('--terminal-bg').trim() || DEFAULT_BG,
    palette: ANSI_COLORS.map(
      ([, property, fallback]) => styles.getPropertyValue(property).trim() || fallback,
    ),
  };
}