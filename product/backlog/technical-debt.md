# technical-debt

## ready

## development

* Build every xterm terminal in the web client through one shared factory, so the harness, shell and recording terminals stop drifting apart on metrics, clipboard and theme handling.

Existing Debt: Terminal construction lives inside three React hooks instead of a framework-free factory in the shared terminal layer, so each tab type copied the parts it knew about and behavior has already split: only the harness terminal answers OSC 52 clipboard requests and remaps Shift+Enter and Alt+arrow keys, only the shell terminal follows theme switches, and all three re-read the same CSS variables with the same hard-coded fallbacks. Severity: 4/10

Existing Risk: 4/10 - A program in a remote or SSH shell tab that copies through OSC 52 silently copies nothing, harness and recording terminals keep the colors they mounted with after a theme change, and the next terminal fix lands in one of three places.

Proposal Risk: 2/10 - All three terminals share construction, metrics and clipboard handling, though key remapping and theme following still differ by tab type until someone decides which terminals should have them.

Proposal: `new Terminal(` appears in `useXterm` (`web/src/shared/terminal/useXterm.ts`), `useShellTerminal` (`web/src/plugins/shell/useShellTerminal.ts`) and `useAsciicastTerminal` (`web/src/plugins/asciicast/useAsciicastTerminal.ts`), each reading `--mono`, `--terminal-font-size` and `--terminal-line-height` with the same 13.5 and 1.2 fallbacks. Only `useXterm` registers the OSC 52 handler (through `osc52ClipboardText` in `web/src/shared/terminal/terminal/osc52.ts`, with a comment saying that without it a remote harness's copy silently does nothing) and applies `shiftEnterSequence` and `altArrowSequence` from `web/src/shared/terminal/terminal/keys.ts`, while only `useShellTerminal` installs a `MutationObserver` on `data-theme` to re-apply `shellTerminalTheme()` from `web/src/plugins/shell/shell-terminal-theme.ts`, even though shell tabs also run remote and SSH PTYs. Add a framework-free `createAppTerminal(container, options)` in a new `web/src/shared/terminal/app-terminal.ts` that reads the metrics once, constructs the `Terminal`, registers OSC 52 when a `copyText` option is given, installs the theme observer when a `theme` function is given, and returns the terminal with one `dispose()` that removes what it installed; use it in all three hooks, and publish it to the concrete plugins through `web/src/plugins/api.ts`, since they may import nothing else of the host's (an additive export, so `TAB_PLUGIN_API_VERSION` does not move). The shell tab gaining OSC 52 through its existing `copyText` capability is a visible change worth a line in `product/specs/shell-tab.md`; leave key remapping and theme following for harness and recording terminals as explicit follow-up decisions rather than switching them on here. Covered by `web/src/shared/terminal/useXterm.test.tsx`, `web/src/plugins/shell/useShellTerminal.test.ts`, `web/src/plugins/asciicast/useAsciicastTerminal.test.ts` (which pins the CSS reads and both fallbacks) and `web/src/shared/terminal/terminal/osc52.test.ts`; add `web/src/shared/terminal/app-terminal.test.ts` for the factory, including that `dispose()` disconnects the observer and the OSC handler.

## deferred

## declined
