# Put the save guard in front of a typed `close <name>`

**Complexity: 3/10.** One client interception plus two small shared, import-free modules that let the command bar resolve a typed close the same way the server does.

## Root cause

The command bar's interception chain in `web/src/agent-tabs/command-input/useCommandBarSubmit.ts` consults the save guard (`guardRef`) only for a bare `close`/`exit`, and only for the active tab. A named `close <name>` / `exit <name>` falls through to `runCommand`, the server's `close` command (`src/commands/close.ts`) resolves the name and calls `managers.tab.closeTab(...)` directly. Whether a tab holds unsaved work is known only in the browser — the dirty handles registered in `tabHandles` — so the server can never ask, and the tab is removed with its unsaved edits.

## Correct behavior

`product/specs/image-tab.md` and `product/specs/editor-tab.md` promise that the save-changes dialog covers every close path, typing `close` or `exit` included. A typed `close <name>` / `exit <name>` whose named tab holds unsaved work raises the same dialog the tab's × button does, and Save / Don't Save / Cancel act on that named tab. A named close of a tab with nothing unsaved, or of a name no tab carries, reaches the server exactly as before.

## Reproduction

Automated, in `web/src/CloseSaveGuard.named-close.test.tsx`: render `CloseSaveGuard` and `useCommandBarSubmit` wired through one `guardRef`, as `App` wires them, with an agent tab `janus` and an image plugin tab `image` titled `alpha.png` whose dirty handle reports unsaved work. Submitting `close alpha.png`, `exit alpha.png`, `close image`, or `CLOSE Alpha.PNG` shows no dialog and calls `runCommand` with the typed text — which the server's `close` command turns into an unconditional `closeTab`. Six of the eight new cases fail on master for that reason.

## Approach

Resolve the named form on the client, where `tabs` is already in hand, and route a hit through the same `guardRef` the × button uses. To keep client and server from disagreeing about which tab a name means, lift the two rules the server uses into shared modules with no runtime imports, which the client already reaches through `@shared` (as `@shared/tab/placement` is today):

- `src/commands/parse-close.ts` — `isCloseCommand` (the command's `match`) and `parseClose`, moved out of `close.ts`, which imports them back.
- `src/tab/name-match.ts` — `matchesLabelOrAlias`, the case-insensitive label-or-alias rule, which `byLabelOrAlias` in `src/tab/lookup.ts` now delegates to.

When the named tab is the last non-docked tab, closing it quits the app; that path is documented separately (`documentation/user-documentation/getting-started/tabs.md`) and stays unchanged — the command still goes to the server.

## Implementation steps

1. Add `src/tab/name-match.ts` and make `byLabelOrAlias` use it. Add `src/commands/parse-close.ts`, move `parseClose` and the close matcher there, import them into `close.ts`, and point `close.test.ts` at the new module. Run check-diff.
2. Add `typedCloseIndex(text, tabs, activeTab)` in `web/src/agent-tabs/command-input/close-interception.ts` — the active tab for a bare close, the named tab for `close <name>`, -1 otherwise or when closing the named tab quits the app — with a colocated unit test. In `useCommandBarSubmit`, replace the bare-close guard check with one guard check over that index, which also keeps the callback under the cognitive-complexity limit. Run check-diff.

## Regression test

`web/src/CloseSaveGuard.named-close.test.tsx` — "typing close <name> for a tab with unsaved work": the dialog appears for the alias, the label, the `exit` alias, and mixed case; Don't Save sends `closeTab` for the named tab's label; Cancel leaves it open and refocuses it; a clean tab and an unknown name still go to the server. `close-interception.test.ts` pins the pure resolution, including the last-tab exception.

## Spec and docs

Tighten the "every close path" sentence in `product/specs/image-tab.md` and `product/specs/editor-tab.md` to name `close <name>` / `exit <name>`, and the matching sentence in `documentation/user-documentation/tab-types/editor.md`.

## Out of scope

Having the server ask the client before closing a tab (a close from an agent's `msg … command`, a schedule, or a profile still cannot see client-side dirty state), the last-tab named close that quits without a prompt, and the unsaved-quit dialog.
