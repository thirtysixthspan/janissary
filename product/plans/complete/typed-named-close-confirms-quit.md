# Confirm a typed `close <name>` that would quit the app

**Complexity: 3/10** — one pure classifier in `web/src/agent-tabs/command-input/close-interception.ts` replaces `typedCloseIndex`, and the submit hook branches on it. No new architecture.

The command bar re-derives the server's close-and-quit decision to choose a dialog. `typedCloseIndex` returned `-1` for a named close whose target would quit the app ("that goes to the server unguarded"), while `useCommandBarSubmit`'s quit branch only matched the bare `close`/`exit` spelling. So `close <name>` naming the last non-docked tab reached the server, which exited at once — no quit confirmation, no unsaved-changes prompt — although the spec says a typed close on the last tab confirms first. The user documentation described the gap as a caveat to work around.

## Goal

Any typed close that would quit the app — bare on the last non-docked tab, or `close <name>` naming it — opens the quit confirmation, exactly as `quit` does. Every other typed close keeps its current route: through the save guard, then to the server.

## Approach

1. Replace `typedCloseIndex` with `classifyTypedClose(text, tabs, activeTab)` returning `{ kind: 'close'; index } | { kind: 'quit' } | { kind: 'none' }`: resolve the target (active tab for a bare close, the label/alias match for a named one), then `closeQuitsApp` decides quit versus close.
2. In `useCommandBarSubmit`, open the quit confirmation for `quit` or a `quit` classification; run the save guard for a `close` classification; otherwise dispatch. The bare-close quit test moves out of the hook into the classifier, keeping the hook's callback within its complexity limit.

## Implementation steps

1. Rewrite `close-interception.ts` and update `useCommandBarSubmit.ts`.
2. Rewrite `close-interception.test.ts` against the new shape; add hook cases.
3. Run `./scripts/run.mjs check-diff`.
4. Update `product/specs/tabs.md` and `documentation/user-documentation/getting-started/tabs.md`.

## Tests

- `close-interception.test.ts`: bare and named closes resolve to their index; other commands and unknown names are `none`; a bare close on the last non-docked tab and a `close <name>` naming it are both `quit`; a docked tab never quits.
- `useCommandBarSubmit.test.ts`: `close <name>` naming the last tab opens the quit confirmation without running the save guard or dispatching; `close <name>` naming another tab runs the save guard with its index and then dispatches. Existing bare `close`/`exit`/`quit` cases keep passing.

## Out of scope

- Server-side confirmation of quit-on-last-close.
- Close paths outside the command bar (sidebar ×, the inactive split pane's command input).
