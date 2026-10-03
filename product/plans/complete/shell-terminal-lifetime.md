# Shell tab: keep the terminal mounted across tab switches

**Complexity: 3/10** — one hook's dependency list and one ref. No contract change: `attachTerminal` is already a stable-enough value that the hook simply must not treat its identity as meaningful.

**Goal.** Stop discarding the shell terminal every time the user switches tabs. The emulator's buffer and its selection are lost on each switch today, so scrollback does not survive leaving and returning to a shell tab.

**Approach.** Take `attachTerminal` out of the effect's dependency list rather than changing what the host passes. The rebuild is driven by the *identity* of the capability object, which the host recreates whenever `active` flips; nothing about the terminal changes when that happens. Reading the capability through a ref keeps the one attachment the hook already promises — a single terminal, a single subscription — while letting the effect depend only on what actually determines it: the pty id and the container.

## Implementation

1. In `web/src/plugins/shell/useShellTerminal.ts`, hold `attachTerminal` in a ref alongside the existing `exitRef`, and read it from inside the effect rather than closing over it.
2. Reduce the effect's dependencies to `ptyId` and `containerRef`. A missing `attachTerminal` still opens nothing, exactly as today.
3. Do not change `web/src/plugins/PluginBody.tsx`. Its memoized capability object legitimately changes identity when `active` changes, and other consumers may rely on that; the fix belongs on the side that was reading too much into it.

## Tests

In `web/src/plugins/shell/useShellTerminal.test.ts`:

- re-rendering with a changed `active` — that is, with a fresh capability object carrying a fresh `attachTerminal` — constructs no second `Terminal` and calls neither `detach` nor `dispose`;
- the existing one-fit, one-detach, resize, exit and teardown cases keep passing unchanged.

## Out of scope

- Changing what the host passes. `web/src/plugins/PluginBody.tsx` memoizing on `active` is correct for a consumer that wants a fresh object when the tab's visibility changes.
- Bounding the terminal's memory while a tab stays open for days. That is the xterm buffer's own concern and applies to every terminal surface in the application.