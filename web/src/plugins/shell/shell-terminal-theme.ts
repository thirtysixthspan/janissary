import { terminalColors } from '../api';

export type ShellTerminalTheme = {
  background: string;
  foreground: string;
  cursor: string;
  cursorAccent: string;
  selectionBackground?: string;
};

export function shellTerminalTheme(): ShellTerminalTheme {
  const styles = getComputedStyle(document.documentElement);
  const read = (name: string) => styles.getPropertyValue(name).trim();
  const fallback = terminalColors();
  const background = read('--bg') || fallback.bg;
  const foreground = read('--fg') || fallback.fg;
  const selection = read('--editor-selection');
  return {
    background,
    foreground,
    cursor: foreground,
    cursorAccent: background,
    ...(selection && { selectionBackground: selection }),
  };
}
