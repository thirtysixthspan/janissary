# Share one confirm dialog between the plugin lists

Issue: the sessions confirm dialog is a verbatim copy of the conversations one.

Complexity rating: 3/10

## Goal

`web/src/plugins/sessions/ConfirmSessionDialog.tsx` reproduces `web/src/plugins/conversations/DeleteConversationDialog.tsx` line for line — the same `selected` state, the same `actionsRef` key table, the same capture-phase `keydown` listener on `globalThis` calling `preventDefault` and `stopPropagation` on every key, and the same markup against the host's modal CSS classes. They differ only in that the sessions one takes its title and confirm label as props.

They are one component, so a fix to either — the swallow-everything key handler being the obvious candidate — has to be made twice. The next plugin list copies whichever version it finds, and janissary's modal confirmations drift apart per plugin, with nothing in the tree that would show the divergence.

## Approach

**Publish it through the client plugin API, which is where shared presentation for plugins already lives.** `ai/guidelines/react-code-organization.md` §2 says promote on the second consumer and only when the module can serve both without feature-specific special-casing — this is the second consumer and the sessions copy already proves the parameterisation works. The plugin import boundary in `eslint.plugin-boundaries.mjs` then decides *where*: a client plugin may reach `../api`, `../shared.css`, and its own contract, and nothing else. A new `web/src/plugins/shared/` directory would need that rule widened, whereas `web/src/plugins/api.ts` already publishes `CommandBarShell`, `InlineEditInput`, and `renderMarkdown` on exactly this rationale — a plugin that renders a host pattern should render the host's own.

So the component lives at `web/src/shared/ConfirmDialog.tsx` with the host's other shared components, and `api.ts` re-exports it. Both lists import it from `../api`, and both copies are deleted. No boundary rule changes.

This also gives the host side a single definition to use. The metadata row's own detach confirmation is bare markup with no keyboard handling at all — a separate backlog entry — and placing the component host-side rather than under the plugin tree is what lets that entry consume this one rather than writing a third copy.

**Do not claim the tests pin the contract.** They do not. Neither `ConversationList.test.tsx` nor `SessionList.test.tsx` exercises a key on either dialog: what they cover is the wording and the click paths. The keyboard behavior — y, n, Enter, Escape, and the arrow toggle — has never been tested in either copy, so the shared component gets a colocated test that pins it once. That is the thing sharing is supposed to make safe to change, and it cannot be until something holds it still.

## Implementation steps

1. Add `web/src/shared/ConfirmDialog.tsx` — the component as `ConfirmSessionDialog` already parameterises it, with a doc comment covering the keyboard contract and the capture-phase listener's reason.
2. Re-export it from `web/src/plugins/api.ts` beside `InlineEditInput`, with the same style of note.
3. Point `SessionList` at `ConfirmDialog` from `../api` and delete `ConfirmSessionDialog.tsx`.
4. Point `ConversationList` at it, supplying the title it used to compose internally and `Delete` as the confirm label, and delete `DeleteConversationDialog.tsx`.

## Tests

- `web/src/shared/ConfirmDialog.test.tsx` (new): y confirms, n cancels, Escape cancels, Enter takes the selected button with Cancel selected first, the arrow keys toggle which is selected, focus lands inside the dialog on mount, and the listener is removed on unmount.
- `web/src/plugins/conversations/ConversationList.test.tsx`: its existing case asserting the dialog's wording must keep passing against the shared component — that is what proves the title moved to the call site intact.
- `web/src/plugins/sessions/SessionList.test.tsx`: its confirmation cases assert the wiring — that pressing detach and end raises the dialog with the right wording and that confirming sends the intent — rather than re-testing the dialog's keys, which now have one home.

## Out of scope

- The key handler's swallow-everything behavior. It is the obvious candidate for a fix and this makes that fix a one-place change, but changing it here would be a behavior change riding a refactor.
- The metadata row's own confirmation, which is its own backlog entry and will consume this.
- Every other dialog in the app; only these two are the same component.

## Specs and docs

No user-visible behavior changes — the dialogs render and answer exactly as before — so no spec, `help.md`, or user-documentation update.
