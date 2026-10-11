# Retain a rejected new role name for correction

**Complexity: 3/10** — one handler in a 108-line composition becomes an awaited one, a guard against double submission, and the tests that pin it. No contract, spec-level rule, or server change; the tab's description already promises the behavior and the code does not deliver it.

`commitNewRole` in `web/src/plugins/roles/RolesTab.tsx` trims the field, clears it, closes the control, and only then raises `add-role` — and `raise` returns a promise nobody awaits, so the outcome never reaches the component. Every rejection therefore arrives after the text the user typed has already been destroyed: a duplicate name is answered `A role named "code review" already exists.` and the user has to reopen the control and type it again. The same handling exists for a rename, a description, and every entry edit, where the draft genuinely does survive — the creation field is the one place it does not, because the field's whole job is to go away once the name is accepted.

The pull request's description states the rule this contradicts: "The rejected text stays in the field it was typed in, so a duplicate name can be corrected and re-committed." The description is the author's statement of intent and is correct as written; the implementation is what has to move.

## Goal

- A refused `add-role` leaves the name on screen, editable, with the server's refusal line under it, so it can be corrected and committed again.
- A successful `add-role` closes and clears the creation field as it does today.
- A delayed answer never destroys typing that arrived after the submission, and one draft is never submitted twice.

## Design decisions

- **Await the intent instead of firing and forgetting.** The composition already has the refusal setter and the capability object; it needs the outcome, and the intent call already answers one. Nothing new is invented — the existing `raise` helper simply cannot express "then clear the field", so the creation path writes its own await and the helper stays where the drop handlers still need it.
- **Clear the draft only when it is still the draft that was submitted.** A response that lands after the user has typed something else must not wipe the newer text, so the clearing compares what is in the field now with what was sent. When they differ the control stays open with the newer text, which is the only outcome that discards nothing.
- **Guard by name, not by a blanket busy flag.** Enter blurs the field, so a keypress arrives as a blur; a guard that refuses every submission while one is in flight would also swallow a genuinely different name the user typed meanwhile. Keying the guard on the submitted name blocks exactly the duplicate the double path produces and lets a second, different name through.
- **An empty field still closes without raising.** That is today's behavior and it is what makes "Add role" reversible by clicking away; only a refusal changes.
- **Escape still cancels immediately**, without waiting for anything in flight, because cancelling is an explicit instruction rather than an outcome.
- **The refusal line keeps its existing rule.** It clears when an edit is raised and is set by the catch, so a refused creation reads exactly like a refused rename.

## Implementation steps

1. **`web/src/plugins/roles/RolesTab.tsx`.** Rewrite `commitNewRole` as an awaited handler: trim, close-and-clear an empty field, return when the same name is already in flight, otherwise clear the refusal, mark the name in flight in a ref, await `capabilities.intent('add-role', …)`, and on success clear and close only while the field still holds the submitted text; on rejection set the refusal line from the error and leave the field alone. Release the in-flight mark only when it is still this submission's.
2. **`product/specs/roles.md`** and **`documentation/user-documentation/tab-types/roles.md`** — say that a refused name stays in its field.

## Tests

`web/src/plugins/roles/RolesTab.test.tsx`:

- A duplicate-name refusal keeps the creation field open with the typed text, shows the refusal line, and lets the corrected name commit afterwards.
- A write-failure refusal does the same, so the recovery is not specific to a duplicate.
- A delayed response does not discard typing made after the submission: the field keeps the newer text and stays open.
- Pressing Enter on a name already in flight submits it once.
- An empty field closes the control without raising, and Escape still cancels outright.

## Out of scope

- The pull request description. It already states the behavior being implemented and stays byte-for-byte as its author wrote it.
- The other editable fields. The rename, description, and entry edits already keep a rejected draft.
- Retrying the refused name itself. The user corrects and commits; the tab never resubmits on its own.
- Anything on the server. The refusals and their wording are unchanged.

## Verification

- `./scripts/run.mjs check-diff` is clean: lint, both typechecks, and the roles client tests.
- Manual check: click **Add role**, type `planning`, press Enter, and confirm `A role named "planning" already exists.` appears with `planning` still in the field; correct it to `planning-role` and press Enter, confirming the card appears and the field closes. Repeat with the file made read-only and confirm the same recovery from `Could not write roles.json at ….`