# Synchronize role description drafts with authoritative payload updates

**Complexity: 5/10** — one colocated hook plus the two-line wiring in a component that is already at 193 lines, a one-field extension to the roles intent contract with the check landing in the module that owns role refusals, and tests on both sides. The hard part is not volume but getting the state machine right: clean versus dirty drafts, the baseline a local edit was written against, and the one window a client cannot close by itself.

A role card seeds its two inputs from props once — `useState(role.name)`, `useState(role.description)` — and never looks at them again. React keeps the card mounted across a payload update: `RolesTab` renders one card per role keyed by `role.name`, so a role whose *name* changed remounts and picks up its new props, but a role whose *description* changed does not. `PluginBody` hands every state broadcast's payload to the same mounted component, so the second client's accepted edit arrives as a new `role.description` on a card that is still showing the first client's text and still holds the first client's baseline.

The consequence is silent and needs no typing at all. Focus the stale description input, click away, and `commitDescription` compares the held text against the *new* `role.description`, finds them different, and raises `describe-role` carrying the old text. The server's `describeRole` finds the role and writes the old description back. Another client's accepted edit is undone by a blur, with nothing on screen to suggest it happened.

## Goal

- A card's field shows the authoritative value whenever the user has not typed since, and a blur on an untouched field raises nothing.
- A local draft is never silently written over a description that changed underneath it: the client reports the conflict and falls back to the stored text, and the server refuses the write when the file moved while the edit was in flight.
- Existing behaviour is untouched: a refused edit keeps the user's text on screen so it can be corrected, Escape reverts to the stored value, Enter and blur both commit, and a name edit behaves exactly as it does today.

## Design decisions

- **The draft follows the server only while it is clean.** "Clean" means the text equals the baseline the user last saw — not "the props never changed". Tracking a baseline rather than diffing against the latest prop is what makes the dirty case detectable at all: without it, a draft that happens to equal the new value and one written against the old value are indistinguishable.
- **A conflict replaces the draft rather than keeping it.** The tab's settled contract is write-through with no unsaved state, and a draft whose baseline is stale cannot be saved — the precondition below would refuse it every time. Keeping it on screen would leave the user typing into a field that refuses to hold. The conflict is reported in the same one-line refusal area every other refusal uses, so the loss is never silent.
- **The precondition is the load-bearing half.** The client's detection depends on a payload arriving. Between another client's write landing on disk and that write's payload reaching this client, the file says one thing and the card says another; a blur in that window raises an edit written against a baseline the server no longer agrees with. `describe-role` therefore carries the `expected` description the edit was written against and refuses when the file no longer holds it. This closes the window the client cannot see, and the check belongs in `role-edits.ts`, whose stated job is refusing a request the caller could have gotten wrong — `activate.ts` spells no role rule twice.
- **`expected` is required, not optional.** An intent without it is a malformed payload refused by the guard before it reaches the file, exactly as every other unvalidated field is. An optional field would leave the race open for any caller that omits it, which is the one case that matters.
- **The hook serves both fields.** A name change remounts the card, so the name never reaches the conflict branch today; routing it through the same hook keeps one mechanism rather than two, and gives `commitName` the baseline it needs to preserve today's `trimmed === role.name` snap-back.
- **No watcher, no new capability.** This is about the tab's own clients republishing, which already arrives as a payload. Re-reading `roles.json` on an external edit was explicitly deferred by the plan that built the tab.

## Implementation steps

1. **`web/src/plugins/roles/useRoleDraft.ts` (new).** `useRoleDraft(authoritative: string)` returning `{ value, set, revert, commit, conflicted }`, where `value` is the text the input shows, `commit()` answers `null` while the draft is clean and `{ text, baseline }` once it is not, `revert()` restores the baseline, and `conflicted` records that the authoritative value arrived under an active draft. The follow-the-server adjustment uses React's "adjusting state when a prop changes" render-phase form so a clean field never paints one frame of the old text, and `conflicted` clears when the user types again so a second conflict reports itself.
2. **`web/src/plugins/roles/RoleCard.tsx`.** Replace the two `useState` fields with two `useRoleDraft` calls, rebuild `commitName` and `commitDescription` on `commit()`/`revert()` (keeping the trimmed-name snap-back exactly as it is), send `expected: change.baseline` with `describe-role`, and raise the conflict through `onRefusal` from one effect keyed on both cards' `conflicted`. Escape calls `revert()` on both drafts instead of assigning `role.name`/`role.description` directly.
3. **`src/plugins/roles/shared.ts`.** `DescribeRoleIntent` gains `expected: string` and `isDescribeRoleIntent` requires it to be a string.
4. **`src/plugins/roles/role-edits.ts`.** `describeRole` takes the expected description and refuses `The description of role "<name>" changed elsewhere — nothing was written.` when the stored description is not that one, before the replace.
5. **`src/plugins/roles/activate.ts`.** The `describe-role` handler passes `value.expected` through.

## Tests

Server, `src/plugins/roles/activate.test.ts`:

- The existing `describe-role` sends carry the `expected` text the file holds, so the add/describe/delete round trip and the partly-damaged-file refusal keep passing unchanged in meaning.
- A `describe-role` whose `expected` is not the stored description is refused with the conflict message, and the file is byte-for-byte unchanged.
- A `describe-role` payload with no `expected` is refused by the guard as malformed, before the file is read, beside the existing malformed-payload assertions.
- A `describe-role` carrying the correct `expected` writes the new description while the role's entries and every other role survive — the round trip the precondition must not break.

Web, `web/src/plugins/roles/RolesTab.test.tsx`:

- Rerendering the tab with a payload whose description changed, with the field untouched, refreshes the input to the stored text and a blur raises no intent at all.
- Rerendering with a changed description while a real draft is active replaces the field with the stored text and shows the conflict in the refusal line.
- A changed description commits `describe-role` with the `expected` text the draft was written against, and an unchanged one raises nothing.
- Escape after a payload update reverts to the stored text, and a refused edit still keeps the user's text so it can be corrected.

## Out of scope

- Re-reading `roles.json` on an external edit made while the tab is open, and any file watcher. The plan that built the tab deferred it and nothing here needs it.
- A precondition on the other edits. `rename-role` cannot lose a change this way — the card is keyed by the name, so a rename remounts it — and the entry edits act on a list that another client's write replaces wholesale, which is the positional-mutation backlog entry's own subject.
- Merging a conflict the way a text editor would. The stored value wins, and the line says so.
- Changing the schema version or the payload shape. Only one intent's fields change, and both ends of it ship together.

## Verification

- `./scripts/run.mjs check-diff` is clean: lint, both typechecks, and the roles tests on both sides.
- Manual check: open the tab twice in two windows against the same home file. In the first, change `research`'s description and commit; the second window's field updates on its own. With a draft half-typed in the second window, commit the change in the first and confirm the second replaces the draft, says why, and no longer offers to write it.