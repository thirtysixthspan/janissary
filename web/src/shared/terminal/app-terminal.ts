import { Terminal, type ITerminalInitOnlyOptions, type ITerminalOptions, type ITheme } from '@xterm/xterm';
import { osc52ClipboardText } from './terminal/osc52';

// Every xterm terminal the app renders — a harness tab's, a shell tab's, a recording's — is built
// here, so the three agree on their metrics and install clipboard and theme handling the same way.
// Framework-free on purpose: a hook decides when a terminal lives, and this decides what one is.

const FALLBACK_FONT_SIZE = 13.5;
const FALLBACK_LINE_HEIGHT = 1.2;

export type AppTerminalOptions = Omit<ITerminalOptions & ITerminalInitOnlyOptions, 'fontFamily' | 'fontSize' | 'lineHeight' | 'theme'> & {
  // A fixed theme stays as built. A function is applied now and again on every app theme switch.
  theme?: ITheme | (() => ITheme);
  // Given, a program's OSC 52 request writes its text to the clipboard through this. Without it the
  // request is parsed and dropped, which is right for a recording replaying someone else's copy.
  copyText?: (text: string) => void;
};

export type AppTerminal = {
  terminal: Terminal;
  // Removes what the factory installed and disposes the terminal.
  dispose(): void;
};

// The app's own terminal metrics, read once per terminal from the stylesheet's custom properties.
function terminalMetrics(): Pick<ITerminalOptions, 'fontFamily' | 'fontSize' | 'lineHeight'> {
  const styles = getComputedStyle(document.documentElement);
  return {
    fontFamily: styles.getPropertyValue('--mono').trim() || 'monospace',
    fontSize: Number(styles.getPropertyValue('--terminal-font-size').replace('px', '')) || FALLBACK_FONT_SIZE,
    lineHeight: Number(styles.getPropertyValue('--terminal-line-height').replace('px', '')) || FALLBACK_LINE_HEIGHT,
  };
}

export function createAppTerminal(container: HTMLElement, options: AppTerminalOptions = {}): AppTerminal {
  const { theme, copyText, ...terminalOptions } = options;
  const terminal = new Terminal({
    ...terminalOptions,
    ...terminalMetrics(),
    ...(theme !== undefined && { theme: typeof theme === 'function' ? theme() : theme }),
  });
  const installed: (() => void)[] = [];
  if (copyText) {
    // A program that copies something on the machine it runs on cannot reach the clipboard of the
    // person watching it from another one, so it asks the terminal to do it instead.
    const osc52 = terminal.parser.registerOscHandler(52, (data) => {
      const text = osc52ClipboardText(data);
      if (text !== null) copyText(text);
      return true;
    });
    installed.push(() => { osc52.dispose(); });
  }
  if (typeof theme === 'function') {
    const observer = new MutationObserver(() => { terminal.options.theme = theme(); });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    installed.push(() => { observer.disconnect(); });
  }
  terminal.open(container);
  return {
    terminal,
    dispose: () => {
      for (const remove of installed) remove();
      terminal.dispose();
    },
  };
}
