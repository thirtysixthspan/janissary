# Build every web xterm terminal through one shared factory

**Complexity: 5/10** — one framework-free factory in the shared terminal layer, three hooks switched onto it, and one additive export to the plugin client API; the one visible change is OSC 52 copying in shell tabs.

## Goal

The harness, shell, and recording terminals are constructed in one place, so their metrics, clipboard handling, and theme handling stop drifting apart. A program running in a shell tab, local, remote, or SSH, that copies through OSC 52 copies to the clipboard, the way it already does in a harness tab.

## Approach

`new Terminal(` appears in `useXterm` (`web/src/shared/terminal/useXterm.ts`), `useShellTerminal` (`web/src/plugins/shell/useShellTerminal.ts`), and `useAsciicastTerminal` (`web/src/plugins/asciicast/useAsciicastTerminal.ts`). Each one reads `--mono`, `--terminal-font-size`, and `--terminal-line-height` with the same 13.5 and 1.2 fallbacks. Only `useXterm` registers the OSC 52 handler, and only `useShellTerminal` follows `data-theme` changes.

Add `createAppTerminal(container, options)` in a new `web/src/shared/terminal/app-terminal.ts`. It reads the three metrics once with the shared fallbacks and constructs the `Terminal` with them plus the caller's own options. When given a `copyText` function, it registers the OSC 52 handler (through `osc52ClipboardText`). When given a `theme` function rather than a fixed theme, it applies it and re-applies it on every `data-theme` change. Then it opens the terminal in `container` and returns `{ terminal, dispose }`, where `dispose()` removes the handler and the observer and disposes the terminal.

Each hook keeps its own behavior:

- The harness terminal (`useXterm`) passes `copyText` and a fixed theme, so it keeps OSC 52 and does not start following theme switches.
- The shell terminal passes `copyText` (through its latest-callback ref) and `shellTerminalTheme` as a function, so it keeps following theme switches and gains OSC 52.
- The recording terminal passes neither, so it keeps the colors it was recorded with. It deliberately gets no OSC 52, because replaying a recording that contains a copy would write to the viewer's clipboard.

Key remapping and theme following for the harness and recording terminals stay as they are, as follow-up decisions. `createAppTerminal` is published to the concrete plugins through `web/src/plugins/api.ts`, which is the only host module they may import. It's an additive export, so `TAB_PLUGIN_API_VERSION` does not move.

## Implementation steps

1. Create `web/src/shared/terminal/app-terminal.ts`.
2. Use it in `useXterm`, keeping the fit addon, selection registration, key handling, and resize observer as they are.
3. Export it from `web/src/plugins/api.ts` and use it in `useShellTerminal`, dropping that hook's own theme observer.
4. Use it in `useAsciicastTerminal`.
5. Add a line to `product/specs/shell-tab.md` for OSC 52 copying.

## Tests

- New `web/src/shared/terminal/app-terminal.test.ts`: the metrics are read from the custom properties, with the 13.5 and 1.2 fallbacks; caller options reach the constructor; OSC 52 is registered only with `copyText` and copies the decoded text; a theme function is applied and re-applied on a `data-theme` change, and a fixed theme installs no observer; the terminal is opened in the container; `dispose()` disconnects the observer, disposes the OSC handler, and disposes the terminal.
- `web/src/plugins/shell/useShellTerminal.test.ts`: an OSC 52 sequence in a shell tab copies its text through `copyText`.
- Existing `web/src/shared/terminal/useXterm.test.tsx`, `web/src/plugins/shell/useShellTerminal.test.ts`, `web/src/plugins/asciicast/useAsciicastTerminal.test.ts` (which pins the CSS reads and both fallbacks), and `web/src/shared/terminal/terminal/osc52.test.ts` stay green.

## Out of scope

- Shift+Enter and Alt+arrow remapping outside the harness terminal.
- Theme following for the harness and recording terminals.
