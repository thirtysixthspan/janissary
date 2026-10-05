# Enable shell markdown decorations

**Complexity: 2/10** — one xterm option, one regression assertion, and a concise spec update.

## Root cause

The shell terminal registers xterm decorations to display rendered application-command markdown, but xterm treats `registerDecoration` as a proposed API. The terminal is constructed without `allowProposedApi`, so submitting a markdown reply throws before the decoration can be registered or the styled-text fallback can run. After enabling that API, long replies still failed: reserving their full measured height placed the decoration marker above xterm's viewport, where xterm does not create the decoration element or invoke its render callback.

## Correct behavior

Application-command markdown replies in a shell tab render as HTML decorations in the terminal scrollback when the normal buffer can hold them. Long content scrolls inside the visible decoration instead of pushing its marker above the viewport. When the decoration cannot be placed, the reply appears as styled terminal text.

## Reproduction

In a running app, type `zsh` in the command bar, then type `help` in the shell tab. Before the fix, the terminal shows no reply and the browser console reports `You must set the allowProposedApi option to true to use proposed API`; no markdown decoration is present.

## Approach

Enable xterm's proposed API on the shell terminal instance, and limit reserved decoration rows to the terminal viewport so long replies remain scrollable within the block. Keep the existing ANSI fallback behavior.

## Implementation steps

1. Set `allowProposedApi: true` in the shell terminal options and add a regression assertion for the option.
2. Cap reserved decoration rows to the visible terminal height and add a regression test for a reply taller than the viewport.
3. Update the shell-tab functional spec and the existing shell-tab user documentation to state that long replies scroll inside the visible decoration and that styled terminal rendering is used when placement is unavailable.

## Regression test

Add an assertion to `web/src/plugins/shell/useShellTerminal.test.ts` that the constructed terminal options enable proposed APIs, and a case in `web/src/plugins/shell/markdown-block.test.ts` that a reply taller than the viewport reserves only visible rows. Both fail on the buggy implementation and pass with the fix.

## Verification

Run `./scripts/run.mjs check-diff`. For the live check, start a scratch instance, open a `zsh` shell tab, submit `help`, and confirm the shell contains a visible `.shell-output-block` decoration with rendered markdown, the reply is scrollable within the block, and the page has no proposed-API error.

## Out of scope

Changing markdown rendering, decoration measurement and placement, terminal selection behavior, or the existing fallback for alternate-buffer and unmeasurable replies.
